import mongoose from "mongoose";
import {
  BulkInventory, Buyback, Customer, Employee,
  PriceAdjustment, Product, Sale, SerializedInventory,
  StockLedger, Store, StoreInventory, User,
} from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";
import { writeAudit } from "../../utils/audit.js";
import { nextSequence } from "../../utils/sequence.js";
import { allocateEffectiveSellingAmounts, classifyLossType, computeCostBasis, evaluateLoss } from "../losses/lossCalculation.service.js";
import { createLossRecordsForSale, reverseLossesForSale } from "../losses/losses.service.js";
import { REVENUE_SALE_STATUSES, historySaleMatch } from "./saleStatus.js";
import { isOnlinePayment, rebuildOnlinePayments } from "./paymentModes.js";
import { customerFields } from "./customerIdentity.js";

// ─── Money helpers ────────────────────────────────────────────────────────────

function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, "Invalid numeric amount", "INVALID_MONEY_VALUE");
  return Math.round(n * 100);
}

function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

// ─── Require helpers ──────────────────────────────────────────────────────────

async function requireStore(storeId) {
  const store = await Store.findOne({ _id: storeId, isActive: { $ne: false } });
  if (!store) throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
}

async function requireCustomer(customerId) {
  const customer = await Customer.findById(customerId);
  if (!customer) throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
}

async function requireEmployee(employeeId, storeId) {
  if (!employeeId) return null;
  const employee = await Employee.findOne({ _id: employeeId, store: storeId, isActive: true });
  if (!employee) throw new HttpError(404, "Selected employee was not found in this store", "SALE_EMPLOYEE_NOT_FOUND");
  return employee;
}

async function requireEmployeeForUser(userId, storeId) {
  const employee = await Employee.findOne({ user: userId, store: storeId, isActive: true });
  if (employee) return employee;

  const user = await User.findById(userId).populate("roles");
  const isAdmin = user && user.roles.some((r) => r.name === "admin");
  if (isAdmin) {
    const storeEmployee = await Employee.findOne({ store: storeId, isActive: true }).sort({ _id: 1 });
    if (storeEmployee) return storeEmployee;
  }
  throw new HttpError(403, "Authenticated user is not an active employee of the selected store", "SALE_EMPLOYEE_STORE_MISMATCH");
}

// ─── Inventory helpers ────────────────────────────────────────────────────────

function mergeItems(items) {
  const map = new Map();
  items.forEach((item) => {
    const pid = item.productId.toString();
    if (!map.has(pid)) {
      map.set(pid, { productId: pid, quantity: 0, adjustedUnitPrice: item.adjustedUnitPrice, adjustmentReason: item.adjustmentReason, adjustmentCategory: item.adjustmentCategory });
    }
    map.get(pid).quantity += item.quantity;
  });
  return Array.from(map.values());
}

// ─── Duplicate-sale guard ─────────────────────────────────────────────────────
// Stock counts alone never proved a device was still sellable. A stale
// inventory row, a hand-edited status, or a return that was never recorded all
// leave a sold handset looking available, and the sale went through anyway
// under a second sale number — two active sales, one physical phone, one job
// number. The authority for a single device is its transaction history, so
// that is what gets checked here.

// Categories that are always one physical unit. Mode alone is not enough:
// `inventoryMode` defaults to "bulk", and phones added through the Inventory
// form keep that default, but a handset is still one device with one job
// number and one IMEI however its stock happens to be tracked.
const UNIT_TRACKED_CATEGORIES = ["new_phone", "used_phone"];

/** A product that is one physical item, not a countable pile. */
export function isUnitTracked(product) {
  return product.inventoryMode === "serialized"
    || UNIT_TRACKED_CATEGORIES.includes(product.category)
    || Boolean(product.imei)
    || Boolean(product.serialNumber);
}

function describeProduct(product) {
  const identity = [product.jobId && `Job ${product.jobId}`, product.imei && `IMEI ${product.imei}`]
    .filter(Boolean)
    .join(" / ");
  return identity ? `${product.name} (${identity})` : product.name;
}

/**
 * Reject a sale whose items are not genuinely available to sell.
 *
 * Two checks, both scoped to single-device products so multi-unit accessories
 * keep selling from their stock count as before:
 *
 *   1. Current status — a device already flagged sold cannot be sold again
 *      until it is retrieved, which is what returns it to "ready".
 *   2. Transaction history — a device may hold at most one live sale line.
 *      A line reversed by a retrieval is not live, so re-selling a genuinely
 *      returned device stays allowed; that is the approved path back.
 */
async function assertNotAlreadySold(products, session) {
  const unitTracked = products.filter(isUnitTracked);
  if (unitTracked.length === 0) return;

  const alreadySold = unitTracked.filter((product) => product.inventoryStatus === "sold");
  if (alreadySold.length > 0) {
    throw new HttpError(
      409,
      `${describeProduct(alreadySold[0])} is already marked sold. Retrieve it back to Ready for Sale before selling it again.`,
      "SALE_PRODUCT_ALREADY_SOLD",
    );
  }

  const liveSales = await Sale.find({
    status: { $in: REVENUE_SALE_STATUSES },
    items: { $elemMatch: { product: { $in: unitTracked.map((product) => product._id) }, retrievedAt: null } },
  }).select("saleNo items.product items.retrievedAt").session(session);

  if (liveSales.length === 0) return;

  // One sale can hold a live line for one device and a retrieved line for
  // another, so each product is matched against the lines individually rather
  // than assuming every returned sale blocks every product.
  for (const product of unitTracked) {
    const blocking = liveSales.find((sale) => sale.items.some(
      (line) => String(line.product) === String(product._id) && !line.retrievedAt,
    ));
    if (blocking) {
      throw new HttpError(
        409,
        `${describeProduct(product)} was already sold on ${blocking.saleNo} and has not been retrieved. Retrieve it from that sale before selling it again.`,
        "SALE_DUPLICATE_PRODUCT",
      );
    }
  }
}

// ─── createSale ───────────────────────────────────────────────────────────────

export async function createSale(input) {
  if (!input.items || input.items.length === 0) {
    throw new HttpError(400, "At least one sale item is required", "SALE_ITEMS_REQUIRED");
  }

  const mergedItems = mergeItems(input.items);
  const productIds  = mergedItems.map((item) => item.productId);

  return withTransaction(async (session) => {
    await requireStore(input.storeId);
    if (input.customerId) await requireCustomer(input.customerId);

    const employee = await requireEmployeeForUser(input.userId, input.storeId);

    // ── Load products ──────────────────────────────────────────────────────
    const products = await Product.find({ _id: { $in: productIds }, isActive: true }).session(session);
    if (products.length !== productIds.length) {
      throw new HttpError(400, "One or more products are invalid or inactive", "SALE_INVALID_PRODUCT");
    }
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    // Verify each device is genuinely sellable before anything is priced or
    // written — status and sale history, not just the stock count.
    await assertNotAlreadySold(products, session);

    // ── Load buyback cost basis for used-phone items (Loss Management) ─────
    const usedPhoneProductIds = products.filter((p) => p.category === "used_phone").map((p) => p._id);
    const buybacksForCostBasis = usedPhoneProductIds.length
      ? await Buyback.find({ inventoryProduct: { $in: usedPhoneProductIds } }).session(session)
      : [];
    const buybackByProductId = new Map(buybacksForCostBasis.map((b) => [String(b.inventoryProduct), b]));

    // ── Load inventory ─────────────────────────────────────────────────────
    const inventoryByProductId = new Map();
    const serializedCounts = await SerializedInventory.aggregate([
      { $match: { store: new mongoose.Types.ObjectId(input.storeId), status: "in_stock", product: { $in: products.filter((p) => p.inventoryMode === "serialized").map((p) => p._id) } } },
      { $group: { _id: "$product", quantity: { $sum: 1 } } },
    ]).session(session);
    serializedCounts.forEach((row) => inventoryByProductId.set(String(row._id), Number(row.quantity || 0)));

    const bulkStocks = await BulkInventory.find({ store: input.storeId, product: { $in: products.filter((p) => p.inventoryMode !== "serialized").map((p) => p._id) } }).session(session);
    bulkStocks.forEach((row) => inventoryByProductId.set(String(row.product), Number(row.quantity || 0)));

    if (inventoryByProductId.size === 0) {
      const inventories = await StoreInventory.find({ store: input.storeId, "items.product": { $in: productIds } }).session(session);
      inventories.forEach((inv) => inv.items.forEach((item) => {
        if (productIds.includes(item.product.toString())) inventoryByProductId.set(item.product.toString(), item.quantity);
      }));
    }

    // ── Validate discounts / exchange ──────────────────────────────────────
    const discountCents  = toCents(input.discountTotal || 0);
    const exchangeCents  = toCents(
      input.exchangeDevices
        ? input.exchangeDevices.reduce((sum, d) => sum + Number(d.exchangeValue || 0), 0)
        : (input.exchangeTotal || 0),
    );

    if (discountCents < 0 || exchangeCents < 0) {
      throw new HttpError(400, "Discount and exchange must be non-negative", "SALE_INVALID_DISCOUNT_EXCHANGE");
    }

    // ── Compute items ──────────────────────────────────────────────────────
    let originalAmountCents = 0;
    let adjustedAmountCents = 0;
    let taxTotalCents       = 0;

    const computedItems = mergedItems.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new HttpError(400, `Product ${item.productId} not found`, "SALE_PRODUCT_NOT_FOUND");
      if (item.quantity <= 0) throw new HttpError(400, "Sale item quantity must be greater than zero", "SALE_INVALID_QUANTITY");
      if (product.inventoryMode === "serialized" && item.quantity !== 1) throw new HttpError(400, "Each job number represents one device and must be sold as quantity 1", "SALE_JOB_QUANTITY_MUST_BE_ONE");

      const available = inventoryByProductId.get(item.productId) || 0;
      if (product.category !== "service" && item.quantity > available) {
        throw new HttpError(400, `Insufficient stock for ${product.name}. Available: ${available}`, "SALE_INSUFFICIENT_STOCK");
      }

      const originalUnitPriceCents = toCents(product.unitPrice);

      // Use employee-set price if provided and valid, otherwise fall back to original
      const requestedAdjusted = item.adjustedUnitPrice != null && !isNaN(Number(item.adjustedUnitPrice))
        ? Number(item.adjustedUnitPrice)
        : null;
      const adjustedUnitPriceCents = requestedAdjusted !== null ? toCents(requestedAdjusted) : originalUnitPriceCents;

      const priceWasAdjusted  = adjustedUnitPriceCents !== originalUnitPriceCents;
      const taxRate           = Number(product.taxRate || 0);
      const lineOrigCents     = originalUnitPriceCents * item.quantity;
      const lineAdjCents      = adjustedUnitPriceCents * item.quantity;
      const lineTaxCents      = Math.round((lineAdjCents * taxRate) / 100);
      const lineTotalCents    = lineAdjCents + lineTaxCents;

      originalAmountCents += lineOrigCents;
      adjustedAmountCents += lineAdjCents;
      taxTotalCents       += lineTaxCents;

      return {
        product:            item.productId,
        quantity:           item.quantity,
        category:           product.category,
        originalUnitPrice:  fromCents(originalUnitPriceCents),
        adjustedUnitPrice:  fromCents(adjustedUnitPriceCents),
        priceWasAdjusted,
        adjustmentReason:   priceWasAdjusted ? (item.adjustmentReason || "") : null,
        adjustmentCategory: priceWasAdjusted ? (item.adjustmentCategory || "negotiation") : null,
        // legacy fields kept for backward compat
        unitPrice:          fromCents(adjustedUnitPriceCents),
        originalPrice:      fromCents(originalUnitPriceCents),
        lineOriginalTotal:  fromCents(lineOrigCents),
        lineAdjustedTotal:  fromCents(lineAdjCents),
        lineAdjustmentDelta:fromCents(lineOrigCents - lineAdjCents),
        taxRate,
        taxAmount:          fromCents(lineTaxCents),
        discountAmount:     0,
        lineTotal:          fromCents(lineTotalCents),
      };
    });

    // ── Loss Management: cost basis + effective selling amount per item ────
    // Bill-level discountCents is allocated proportionally across items by
    // their share of lineAdjustedTotal; exchangeCents is never subtracted
    // here (exchange economics live on the traded-in device's own Buyback).
    const lossAllocations = allocateEffectiveSellingAmounts(
      computedItems.map((item) => ({ lineAdjustedTotalCents: toCents(item.lineAdjustedTotal) })),
      discountCents,
    );
    const computedItemsForLoss = computedItems.map((item, index) => {
      const product = productMap.get(String(item.product));
      const buyback = product?.category === "used_phone" ? buybackByProductId.get(String(product._id)) : null;
      const { costBasisCents, costBasisSource, buybackId } = computeCostBasis({
        productCategory: product?.category,
        purchasePrice: product?.purchasePrice,
        quantity: item.quantity,
        buyback,
      });
      const { effectiveSellingAmountCents, discountAllocatedCents } = lossAllocations[index];
      const { grossResultCents, isLoss, lossAmountCents, lossPercentage } = evaluateLoss({ costBasisCents, effectiveSellingAmountCents });
      const { lossType, lossReason } = isLoss
        ? classifyLossType({ hasBuyback: Boolean(buyback), priceWasAdjusted: item.priceWasAdjusted, adjustmentCategory: item.adjustmentCategory })
        : { lossType: null, lossReason: null };

      // Persisted directly on the Sale.items subdocument (immutable snapshot)
      item.costBasis = fromCents(costBasisCents);
      item.costBasisSource = costBasisSource;
      item.effectiveSellingAmount = fromCents(effectiveSellingAmountCents);
      item.grossResult = fromCents(grossResultCents);
      item.isLoss = isLoss;

      return {
        isLoss,
        costBasis: item.costBasis,
        effectiveSellingAmount: item.effectiveSellingAmount,
        discountAllocated: fromCents(discountAllocatedCents),
        lossAmount: fromCents(lossAmountCents),
        lossPercentage,
        lossType,
        lossReason,
        buybackId,
      };
    });

    const priceAdjustmentTotalCents = originalAmountCents - adjustedAmountCents;
    const grandTotalCents = adjustedAmountCents + taxTotalCents - discountCents - exchangeCents;
    if (grandTotalCents < 0) throw new HttpError(400, "Grand total cannot be negative. Exchange/discount exceeds sale value.", "SALE_NEGATIVE_TOTAL");

    const paidCents = (input.payments || []).reduce((sum, p) => sum + toCents(p.amount), 0);
    if (paidCents > grandTotalCents) throw new HttpError(400, "Payment total cannot exceed sale grand total", "SALE_PAYMENT_EXCEEDS_TOTAL");

    const paymentStatus = paidCents <= 0 ? "pending" : paidCents < grandTotalCents ? "partial" : "paid";

    await requireEmployee(input.attendedBy, input.storeId);
    await requireEmployee(input.referredByEmployee, input.storeId);

    // ── Create sale record ─────────────────────────────────────────────────
    const [sale] = await Sale.create([{
      saleNo:               "SALE-PENDING",
      store:                input.storeId,
      customer:             input.customerId || null,
      employee:             employee._id,
      status:               "completed",
      originalAmount:       fromCents(originalAmountCents),
      adjustedAmount:       fromCents(adjustedAmountCents),
      priceAdjustmentTotal: fromCents(priceAdjustmentTotalCents),
      subtotal:             fromCents(adjustedAmountCents),
      taxTotal:             fromCents(taxTotalCents),
      discountTotal:        fromCents(discountCents),
      exchangeTotal:        fromCents(exchangeCents),
      grandTotal:           fromCents(grandTotalCents),
      amountPaid:           fromCents(paidCents),
      paymentStatus,
      note:                 input.note || null,
      jobNumber:            input.jobNumber || null,
      icNumber:             input.icNumber  || null,
      cashAmount:           fromCents(toCents(input.cashAmount || 0)),
      onlineAmount:         fromCents(toCents(input.onlineAmount || 0)),
      exchangeModel:        input.exchangeModel || null,
      gotAmount:            fromCents(toCents(input.gotAmount || 0)),
      gift:                 input.gift || null,
      salespersonName:      input.salespersonName || null,
      attendedBy:           input.attendedBy || null,
      customerSource:       input.customerSource || "walk_in",
      referredByEmployee:   input.referredByEmployee || null,
      referralNotes:        input.referralNotes || null,
      items:                computedItems,
      payments: (input.payments || []).map((p) => ({
        paymentMethod: p.paymentMethod,
        status:        "paid",
        amount:        fromCents(toCents(p.amount)),
        referenceNo:   p.referenceNo || null,
        notes:         p.notes || null,
        createdBy:     input.userId,
      })),
    }], { session });

    // Short, sequential, human-readable — e.g. SAL-000123 — instead of a
    // date+hash string. Only affects sales created from now on; existing
    // saleNo values are never regenerated.
    const finalSaleNo = await nextSequence("sale_no", "SAL-", 6);
    sale.saleNo = finalSaleNo;
    await sale.save({ session });

    const ctx = { userId: input.userId, employeeId: employee._id, storeId: input.storeId };

    // ── Loss Management: create LossRecord docs for below-cost items only ──
    await createLossRecordsForSale({
      sale,
      computedItems: computedItemsForLoss,
      productMap,
      employeeId: employee._id,
      customerId: input.customerId || null,
      storeId: input.storeId,
      userId: input.userId,
      session,
    });

    // ── PriceAdjustment records ────────────────────────────────────────────
    const adjustedItems = computedItems.filter((item) => item.priceWasAdjusted);
    if (adjustedItems.length > 0) {
      const adjDocs = adjustedItems.map((item) => {
        const diff   = item.originalUnitPrice - item.adjustedUnitPrice;
        const pct    = item.originalUnitPrice > 0 ? (diff / item.originalUnitPrice) * 100 : 0;
        const saleItem = sale.items.find((si) => si.product.toString() === item.product.toString());
        return {
          sale:             sale._id,
          saleItemId:       saleItem?._id || null,
          product:          item.product,
          employee:         employee._id,
          store:            input.storeId,
          originalPrice:    item.originalUnitPrice,
          newPrice:         item.adjustedUnitPrice,
          differenceAmount: diff,
          differencePercent:Number(pct.toFixed(2)),
          reasonCategory:   item.adjustmentCategory || "negotiation",
          reasonNote:       item.adjustmentReason   || null,
        };
      });
      await PriceAdjustment.insertMany(adjDocs, { session });

      await writeAudit({
        action: "price_adjusted", entityType: "sale", entityId: sale._id, ctx,
        metadata: { saleNo: finalSaleNo, adjustments: adjDocs.map((a) => ({ product: a.product, originalPrice: a.originalPrice, newPrice: a.newPrice, reason: a.reasonNote })) },
      });
    }

    // ── Exchange buybacks ─────────────────────────────────────────────────
    if (input.exchangeDevices && input.exchangeDevices.length > 0) {
      for (const dev of input.exchangeDevices) {
        let buybackRef = null;

        if (dev.imei) {
          try {
            const [bb] = await Buyback.create([{
              transactionType: "exchange",
              imei:            dev.imei,
              brand:           dev.brand,
              model:           dev.model,
              color:           dev.color || "",
              customer:        input.customerId || null,
              store:           input.storeId,
              destinationStore: dev.destinationStoreId || input.storeId,
              linkedSale:      sale._id,
              linkedSaleNo:    finalSaleNo,
              linkedProductIds: sale.items.map((item) => item.product),
              inventoryStatus: dev.inventoryStatus || "ready",
              condition:       dev.condition || "good",
              marketValue:     dev.marketValue || dev.exchangeValue,
              negotiatedPrice: dev.exchangeValue,
              status:          "accepted",
              notes:           `Exchange from sale ${finalSaleNo}. ${dev.conditionNotes || ""}`.trim(),
              createdBy:       input.userId,
            }], { session });
            buybackRef = bb._id;
          } catch {
            // Duplicate IMEI or serial in buyback — skip auto-creation, staff will handle manually
          }
        }
      }

      await writeAudit({
        action: "exchange_added", entityType: "sale", entityId: sale._id, ctx,
        metadata: { saleNo: finalSaleNo, devices: input.exchangeDevices.map((d) => ({ brand: d.brand, model: d.model, imei: d.imei, value: d.exchangeValue })) },
      });
    }

    // ── Inventory deduction ────────────────────────────────────────────────
    for (const item of computedItems) {
      if (item.category === "service") continue;
      const soldProduct = productMap.get(String(item.product));

      if (soldProduct?.inventoryMode === "serialized") {
        const serialRows = await SerializedInventory.find({ store: input.storeId, product: item.product, status: "in_stock" }).sort({ createdAt: 1 }).limit(item.quantity).session(session);
        if (serialRows.length !== item.quantity) throw new HttpError(409, "Concurrent serialized stock conflict detected", "SALE_STOCK_CONFLICT");
        await SerializedInventory.updateMany({ _id: { $in: serialRows.map((r) => r._id) } }, { $set: { status: "sold", updatedAt: new Date() } }, { session });
        await StoreInventory.findOneAndUpdate({ store: input.storeId, "items.product": item.product }, { $inc: { "items.$.quantity": -item.quantity }, $set: { updatedAt: new Date() } }, { session });
        // A serialized product should not carry a bulk row, but an earlier
        // status edit could have created one. Drain it in the same
        // transaction so no model is left claiming the device is on hand.
        await BulkInventory.updateOne(
          { store: input.storeId, product: item.product, quantity: { $gt: 0 } },
          { $set: { quantity: 0, updatedAt: new Date() } },
          { session },
        );
      } else {
        const updatedBulk = await BulkInventory.findOneAndUpdate(
          { store: input.storeId, product: item.product, quantity: { $gte: item.quantity } },
          { $inc: { quantity: -item.quantity }, $set: { updatedAt: new Date() } },
          { session, returnDocument: "after" },
        );
        if (!updatedBulk) {
          const updatedInv = await StoreInventory.findOneAndUpdate(
            { store: new mongoose.Types.ObjectId(input.storeId), items: { $elemMatch: { product: new mongoose.Types.ObjectId(item.product), quantity: { $gte: item.quantity } } } },
            { $inc: { "items.$.quantity": -item.quantity }, $set: { updatedAt: new Date() } },
            { session, returnDocument: "after" },
          );
          if (!updatedInv) throw new HttpError(409, "Concurrent stock update conflict or insufficient stock detected", "SALE_STOCK_CONFLICT");
          // The legacy model carried the stock, so the bulk row was stale.
          // Bring it down with it instead of leaving a quantity behind that
          // would keep reporting the sold unit as available.
          await BulkInventory.updateOne(
            { store: input.storeId, product: item.product, quantity: { $gt: 0 } },
            { $set: { quantity: 0, updatedAt: new Date() } },
            { session },
          );
        }
        await StoreInventory.findOneAndUpdate({ store: input.storeId, "items.product": item.product }, { $set: { "items.$.quantity": 0, updatedAt: new Date() } }, { session });
      }

      await StockLedger.create([{ store: input.storeId, product: item.product, movementType: "out", quantity: item.quantity, referenceType: "sale", referenceId: sale._id, note: `Sale ${finalSaleNo}`, createdBy: input.userId }], { session });
      await Product.updateOne({ _id: item.product }, { $set: { inventoryStatus: "sold", updatedAt: new Date() } }, { session });
    }

    // ── Customer lifetime stats ────────────────────────────────────────────
    if (input.customerId) {
      await Customer.findByIdAndUpdate(input.customerId, {
        $inc: {
          lifetimeValue:         fromCents(grandTotalCents),
          totalPurchaseCount:    1,
          totalExchangeValue:    fromCents(exchangeCents),
          totalPriceAdjustments: fromCents(priceAdjustmentTotalCents),
        },
      }, { session });
    }

    // ── Sale created audit log ─────────────────────────────────────────────
    await writeAudit({
      action: "sale_created", entityType: "sale", entityId: sale._id, ctx,
      metadata: { saleNo: finalSaleNo, grandTotal: fromCents(grandTotalCents), originalAmount: fromCents(originalAmountCents), adjustedAmount: fromCents(adjustedAmountCents), exchangeTotal: fromCents(exchangeCents), itemCount: computedItems.length },
    });

    return { sale: sale.toObject(), items: sale.items, payments: sale.payments };
  });
}

// ─── getSaleById ──────────────────────────────────────────────────────────────

export async function getSaleById(saleId) {
  const sale = await Sale.findById(saleId);
  if (!sale) throw new HttpError(404, "Sale not found", "SALE_NOT_FOUND");
  return { sale: sale.toObject(), items: sale.items, payments: sale.payments };
}

// ─── getSaleDetail ──────────────────────────────────────────────────────────
// Fully populated, human-readable sale detail for the "View" feature in Sales
// history — distinct from getSaleById (kept raw/unpopulated since callers like
// updateSale/deleteSale rely on sale.store being a plain ObjectId for access checks).

function mapSaleDetail(sale) {
  return {
    id:                    String(sale._id),
    sale_no:               sale.saleNo,
    status:                sale.status,
    store_id:              sale.store?._id ? String(sale.store._id) : String(sale.store),
    store_name:            sale.store?.name || "",
    // Type and name are separate attributes: a sale always has a type, and
    // carries a name only when a customer record was linked. See
    // customerIdentity.js for why "Walk-in" never appears as a name.
    ...customerFields(sale),
    customer_phone:        sale.customer?.phone || "",
    employee_id:           sale.employee?._id ? String(sale.employee._id) : String(sale.employee),
    employee_name:         sale.employee?.fullName || sale.salespersonName || "",
    attended_by_name:      sale.attendedBy?.fullName || "",
    referred_by_name:      sale.referredByEmployee?.fullName || "",
    referral_notes:        sale.referralNotes || "",
    original_amount:       Number(sale.originalAmount || 0).toFixed(2),
    adjusted_amount:       Number(sale.adjustedAmount || 0).toFixed(2),
    price_adjustment_total:Number(sale.priceAdjustmentTotal || 0).toFixed(2),
    subtotal:               Number(sale.subtotal || 0).toFixed(2),
    tax_total:               Number(sale.taxTotal || 0).toFixed(2),
    discount_total:          Number(sale.discountTotal || 0).toFixed(2),
    exchange_total:          Number(sale.exchangeTotal || 0).toFixed(2),
    grand_total:             Number(sale.grandTotal || 0).toFixed(2),
    // Retrieval breakdown: grand_total is the original bill and never moves;
    // net_total is what the sale still counts for after items came back.
    retrieved_total:         Number(sale.retrievedTotal || 0).toFixed(2),
    net_total:               Math.max(0, Number(sale.grandTotal || 0) - Number(sale.retrievedTotal || 0)).toFixed(2),
    is_retrieved:            sale.status === "retrieved",
    is_partially_retrieved:  sale.status === "partially_retrieved",
    amount_paid:             Number(sale.amountPaid || 0).toFixed(2),
    payment_status:          sale.paymentStatus,
    job_number:              sale.jobNumber || "",
    ic_number:               sale.icNumber || "",
    gift:                    sale.gift || "",
    note:                    sale.note || "",
    created_at:              sale.createdAt,
    items: sale.items.map((item) => ({
      id:                      String(item._id),
      product_id:              item.product?._id ? String(item.product._id) : String(item.product),
      product_name:            item.product?.name || "",
      brand:                   item.product?.brand || "",
      model:                   item.product?.model || "",
      imei:                    item.product?.imei || "",
      job_id:                  item.product?.jobId || "",
      sku:                     item.product?.sku || "",
      category:                item.product?.category || item.category || "",
      quantity:                item.quantity,
      original_unit_price:     Number(item.originalUnitPrice || 0).toFixed(2),
      adjusted_unit_price:     Number(item.adjustedUnitPrice || 0).toFixed(2),
      price_was_adjusted:      Boolean(item.priceWasAdjusted),
      adjustment_reason:       item.adjustmentReason || "",
      adjustment_category:     item.adjustmentCategory || "",
      line_original_total:     Number(item.lineOriginalTotal || 0).toFixed(2),
      line_adjusted_total:     Number(item.lineAdjustedTotal || 0).toFixed(2),
      tax_amount:              Number(item.taxAmount || 0).toFixed(2),
      line_total:              Number(item.lineTotal || 0).toFixed(2),
      // Loss Management: immutable per-item snapshot (spec §36)
      cost_basis:              Number(item.costBasis || 0).toFixed(2),
      cost_basis_source:       item.costBasisSource || null,
      effective_selling_amount:Number(item.effectiveSellingAmount || 0).toFixed(2),
      gross_result:            Number(item.grossResult || 0).toFixed(2),
      is_loss:                 Boolean(item.isLoss),
      retrieved:               Boolean(item.retrievedAt),
      retrieved_at:            item.retrievedAt || null,
      retrieval_reason:        item.retrievalReason || "",
    })),
    payments: sale.payments.map((p) => ({
      id:           String(p._id),
      method:       p.paymentMethod,
      status:       p.status,
      amount:       Number(p.amount || 0).toFixed(2),
      reference_no: p.referenceNo || "",
      notes:        p.notes || "",
      paid_at:      p.paidAt,
    })),
  };
}

export async function getSaleDetail(saleId) {
  const sale = await Sale.findById(saleId)
    .populate("customer", "fullName phone")
    .populate("store", "name")
    .populate("employee", "fullName")
    .populate("attendedBy", "fullName")
    .populate("referredByEmployee", "fullName")
    .populate("items.product", "name brand model imei jobId sku category");
  if (!sale) throw new HttpError(404, "Sale not found", "SALE_NOT_FOUND");
  return mapSaleDetail(sale);
}

// ─── listSales ────────────────────────────────────────────────────────────────

export async function listSales(input) {
  const limit  = Math.max(1, Math.min(input?.limit  || 5000, 5000));
  const offset = Math.max(0, input?.offset || 0);
  const query  = {};
  if (input?.storeId) query.store = input.storeId;

  // Retrieved sales stay in history rather than vanishing — the transaction
  // really happened, and hiding it would leave the reversal invisible. They
  // come back flagged, with their retrieved value broken out, so the list can
  // show what was returned instead of presenting it as a plain completed sale.
  const sales = await Sale.find({ ...query, ...historySaleMatch })
    .populate("customer", "fullName phone")
    .populate("store", "name")
    .populate("employee", "fullName")
    .populate("items.product", "jobId name brand model imei")
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);

  return sales.map((sale) => ({
    id:              sale._id.toString(),
    sale_no:         sale.saleNo,
    customer:        sale.customer?._id?.toString?.() || null,
    ...customerFields(sale),
    store_ref:       sale.store?._id?.toString?.() || String(sale.store),
    store_name:      sale.store?.name || "",
    employee_id:     sale.employee?._id?.toString?.() || String(sale.employee),
    employee_name:   sale.employee?.fullName || sale.salespersonName || "",
    job_no:          sale.jobNumber || sale.items[0]?.product?.jobId || "",
    sold_at:         sale.createdAt,
    notes:           sale.note || "",
    original_amount: Number(sale.originalAmount || 0).toFixed(2),
    adjusted_amount: Number(sale.adjustedAmount  || 0).toFixed(2),
    price_adjustment_total: Number(sale.priceAdjustmentTotal || 0).toFixed(2),
    exchange_total:  Number(sale.exchangeTotal || 0).toFixed(2),
    total_amount:    Number(sale.grandTotal    || 0).toFixed(2),
    payment_status:  sale.paymentStatus,
    sale_status:     sale.status,
    // total_amount stays the original billed figure; net_amount is what still
    // counts after retrievals, which is the number every revenue figure uses.
    retrieved_total: Number(sale.retrievedTotal || 0).toFixed(2),
    net_amount:      Math.max(0, Number(sale.grandTotal || 0) - Number(sale.retrievedTotal || 0)).toFixed(2),
    is_retrieved:    sale.status === "retrieved",
    is_partially_retrieved: sale.status === "partially_retrieved",
    retrieved_at:    sale.items.reduce((latest, item) => (
      item.retrievedAt && (!latest || item.retrievedAt > latest) ? item.retrievedAt : latest
    ), null),
    payment_method:  sale.payments.map((p) => p.paymentMethod).filter(Boolean).join(", "),
    items: sale.items.map((item) => ({
      id:               item._id?.toString?.(),
      product:          item.product?._id?.toString?.() || String(item.product),
      job_no:           item.product?.jobId || sale.jobNumber || "",
      product_name:     item.product?.name || "",
      brand:            item.product?.brand || "",
      imei:             item.product?.imei || "",
      quantity:         item.quantity,
      original_price:   Number(item.originalUnitPrice || item.originalPrice || 0).toFixed(2),
      unit_price:       Number(item.adjustedUnitPrice  || item.unitPrice     || 0).toFixed(2),
      price_was_adjusted: Boolean(item.priceWasAdjusted),
      adjustment_delta: Number(item.lineAdjustmentDelta || 0).toFixed(2),
      adjustment_reason:item.adjustmentReason || null,
      line_total:       Number(item.lineTotal || 0).toFixed(2),
      // Loss snapshot as recorded at the time of sale. Read back verbatim and
      // never recomputed from today's prices, so history stays truthful.
      cost_basis:              Number(item.costBasis || 0).toFixed(2),
      effective_selling_amount:Number(item.effectiveSellingAmount || 0).toFixed(2),
      gross_result:            Number(item.grossResult || 0).toFixed(2),
      is_loss:                 Boolean(item.isLoss),
      retrieved:               Boolean(item.retrievedAt),
      retrieved_at:            item.retrievedAt || null,
      retrieval_reason:        item.retrievalReason || null,
    })),
  }));
}

// ─── updateSale ───────────────────────────────────────────────────────────────

export async function updateSale(saleId, input) {
  return withTransaction(async (session) => {
    const sale = await Sale.findById(saleId).session(session);
    if (!sale) throw new HttpError(404, "Sale not found", "SALE_NOT_FOUND");

    if (input.storeId !== undefined && input.storeId.toString() !== sale.store.toString()) {
      throw new HttpError(409, "Store cannot be changed for an existing sale", "SALE_STORE_IMMUTABLE");
    }
    if (input.customerId !== undefined && input.customerId !== null) await requireCustomer(input.customerId);

    const exchangeCents      = toCents(sale.exchangeTotal);
    const existingCashCents  = sale.payments.filter((p) => p.paymentMethod === "cash").reduce((s, p) => s + toCents(p.amount), 0);
    const existingOnlineCents= sale.payments.filter(isOnlinePayment).reduce((s, p) => s + toCents(p.amount), 0);
    const existingWalletCents= sale.payments.filter((p) => p.paymentMethod === "wallet").reduce((s, p) => s + toCents(p.amount), 0);

    const cashCents   = input.cashAmount   !== undefined ? toCents(input.cashAmount)   : existingCashCents;
    const onlineCents = input.onlineAmount !== undefined ? toCents(input.onlineAmount) : existingOnlineCents;
    const walletCents = existingWalletCents > 0 ? existingWalletCents : exchangeCents;

    const paidCents        = cashCents + onlineCents + walletCents;
    const grandTotalCents  = toCents(sale.grandTotal);
    if (paidCents > grandTotalCents) throw new HttpError(400, "Payment total cannot exceed sale grand total", "SALE_PAYMENT_EXCEEDS_TOTAL");

    const paymentStatus = paidCents <= 0 ? "pending" : paidCents < grandTotalCents ? "partial" : "paid";

    sale.customer     = input.customerId === undefined ? sale.customer : input.customerId;
    sale.amountPaid   = fromCents(paidCents);
    sale.paymentStatus= paymentStatus;
    if (input.note !== undefined) sale.note = input.note;

    // Read the existing modes before the array is cleared — they are what says
    // whether the online money was UPI, card or an actual bank transfer.
    const onlinePayments = rebuildOnlinePayments(sale.payments, onlineCents);

    sale.payments = [];
    if (cashCents   > 0) sale.payments.push({ paymentMethod: "cash",          status: "paid", amount: fromCents(cashCents),   createdBy: input.userId });
    onlinePayments.forEach(({ paymentMethod, amountCents, referenceNo }) => {
      sale.payments.push({ paymentMethod, status: "paid", amount: fromCents(amountCents), referenceNo, createdBy: input.userId });
    });
    if (walletCents > 0) sale.payments.push({ paymentMethod: "wallet",        status: "paid", amount: fromCents(walletCents), notes: "exchange credit", createdBy: input.userId });

    await sale.save({ session });
    await writeAudit({ action: "sale_payment_updated", entityType: "sale", entityId: sale._id, ctx: { userId: input.userId }, metadata: { saleNo: sale.saleNo, paidCents, paymentStatus } });

    return { sale: sale.toObject(), items: sale.items, payments: sale.payments };
  });
}

// ─── deleteSale ───────────────────────────────────────────────────────────────

export async function deleteSale(saleId, userId) {
  return withTransaction(async (session) => {
    const sale = await Sale.findById(saleId).populate("items.product").session(session);
    if (!sale) throw new HttpError(404, "Sale not found", "SALE_NOT_FOUND");

    for (const item of sale.items) {
      if (item.product.category === "service") continue;

      // Reverse the deduction against whichever model actually holds the
      // stock, mirroring the sale itself. Restoring the wrong model is how a
      // reversed sale ends up with Product "ready" while the device stays
      // invisible — or worse, counted twice.
      if (item.product.inventoryMode === "serialized") {
        // SerializedInventory is authoritative per device. Return exactly the
        // number of devices this line removed, newest sale first.
        const soldRows = await SerializedInventory.find({ store: sale.store, product: item.product._id, status: "sold" })
          .sort({ updatedAt: -1 })
          .limit(item.quantity)
          .session(session);
        if (soldRows.length > 0) {
          await SerializedInventory.updateMany(
            { _id: { $in: soldRows.map((row) => row._id) } },
            { $set: { status: "in_stock", updatedAt: new Date() } },
            { session },
          );
        }
      } else {
        // Give back what the sale took, rather than resetting the row to 1 —
        // that would erase real bulk stock on a multi-unit product.
        await BulkInventory.findOneAndUpdate(
          { store: sale.store, product: item.product._id },
          { $inc: { quantity: item.quantity }, $set: { reservedQuantity: 0, updatedAt: new Date() } },
          { upsert: true, session },
        );
      }

      await StoreInventory.findOneAndUpdate({ store: new mongoose.Types.ObjectId(sale.store), "items.product": new mongoose.Types.ObjectId(item.product._id) }, { $inc: { "items.$.quantity": item.quantity }, $set: { updatedAt: new Date() } }, { session });
      await StockLedger.create([{ store: sale.store, product: item.product._id, movementType: "in", quantity: item.quantity, referenceType: "sale_reversal", referenceId: sale._id, note: `Sale ${sale.saleNo} deleted`, createdBy: userId }], { session });
      await Product.updateOne({ _id: item.product._id }, { $set: { inventoryStatus: "ready", updatedAt: new Date() } }, { session });
    }

    // Reverse customer stats
    if (sale.customer) {
      await Customer.findByIdAndUpdate(sale.customer, {
        $inc: {
          lifetimeValue:         -Number(sale.grandTotal   || 0),
          totalPurchaseCount:    -1,
          totalExchangeValue:    -Number(sale.exchangeTotal || 0),
          totalPriceAdjustments: -Number(sale.priceAdjustmentTotal || 0),
        },
      }, { session });
    }

    // Loss Management: reverse (never delete) any active loss records tied to this sale
    await reverseLossesForSale({ saleId, userId, reason: "Sale cancelled", session });

    await Sale.deleteOne({ _id: saleId }).session(session);
    await writeAudit({ action: "sale_cancelled", entityType: "sale", entityId: saleId, ctx: { userId }, metadata: { saleNo: sale.saleNo } });
  });
}

// ─── lookupSaleJob ────────────────────────────────────────────────────────────

export async function lookupSaleJob(jobNumber, auth) {
  const scopedStore      = auth?.roles?.includes("admin") ? null : new mongoose.Types.ObjectId(auth.store_id);
  const scopedStoreQuery = scopedStore ? { store: scopedStore } : {};

  const sale    = await Sale.findOne({ $or: [{ jobNumber }, { saleNo: jobNumber }] }).populate("customer").populate("attendedBy").populate("referredByEmployee").sort({ createdAt: -1 }).lean();
  const product = await Product.findOne({ $or: [{ jobId: jobNumber }, { jobNumber }, { barcode: jobNumber }, { imei: jobNumber }, { serialNumber: jobNumber }], isActive: true }).lean();

  const inventoryStoreFilter  = scopedStore ? { store: scopedStore } : {};
  const serializedInventory   = product ? await SerializedInventory.find({ ...inventoryStoreFilter, product: product._id }).sort({ createdAt: -1 }).limit(25).lean() : [];
  const bulkInventory         = product ? await BulkInventory.find({ ...inventoryStoreFilter, product: product._id }).lean() : [];
  const visibleSale           = sale && (!scopedStore || String(sale.store) === String(scopedStore)) ? sale : null;
  const buyback               = await Buyback.findOne({ ...scopedStoreQuery, $or: [{ jobNo: jobNumber }, { imei: jobNumber }] }).sort({ createdAt: -1 }).lean();
  const visibleProduct        = product && (!scopedStore || visibleSale || serializedInventory.length > 0 || bulkInventory.length > 0) ? product : null;

  return {
    sale: visibleSale ? {
      id:                   visibleSale._id.toString(),
      sale_no:              visibleSale.saleNo,
      customer:             visibleSale.customer ? visibleSale.customer._id?.toString?.() || String(visibleSale.customer) : null,
      store_ref:            visibleSale.store?.toString?.() || String(visibleSale.store),
      job_no:               visibleSale.jobNumber || visibleSale.saleNo,
      original_amount:      Number(visibleSale.originalAmount  || 0).toFixed(2),
      adjusted_amount:      Number(visibleSale.adjustedAmount  || 0).toFixed(2),
      exchange_total:       Number(visibleSale.exchangeTotal   || 0).toFixed(2),
      grand_total:          Number(visibleSale.grandTotal      || 0).toFixed(2),
      cash_amount:          Number(visibleSale.cashAmount      || 0).toFixed(2),
      online_amount:        Number(visibleSale.onlineAmount    || 0).toFixed(2),
      got_amount:           Number(visibleSale.gotAmount || visibleSale.amountPaid || 0).toFixed(2),
      payment_status:       visibleSale.paymentStatus,
      sold_at:              visibleSale.createdAt,
      notes:                visibleSale.note || "",
      items: (visibleSale.items || []).map((item) => ({
        product:          String(item.product),
        quantity:         item.quantity,
        original_price:   Number(item.originalUnitPrice || item.originalPrice || 0).toFixed(2),
        unit_price:       Number(item.adjustedUnitPrice  || item.unitPrice     || 0).toFixed(2),
        price_was_adjusted: Boolean(item.priceWasAdjusted),
        line_total:       Number(item.lineTotal || 0).toFixed(2),
      })),
    } : null,
    product: visibleProduct ? {
      id:             visibleProduct._id.toString(),
      job_id:         visibleProduct.jobId || visibleProduct.jobNumber || "",
      sku:            visibleProduct.sku,
      imei:           visibleProduct.imei || "",
      name:           visibleProduct.name,
      brand:          visibleProduct.brand || "",
      model:          visibleProduct.model || "",
      category:       visibleProduct.category,
      price:          Number(visibleProduct.unitPrice || 0).toFixed(2),
      stock_quantity: visibleProduct.inventoryMode === "serialized" ? serializedInventory.filter((e) => e.status === "in_stock").length : bulkInventory.reduce((s, r) => s + Number(r.quantity || 0), 0),
      inventory_mode: visibleProduct.inventoryMode || "bulk",
      active:         Boolean(visibleProduct.isActive),
    } : null,
    customer: visibleSale?.customer ? { id: visibleSale.customer._id.toString(), name: visibleSale.customer.fullName, phone: visibleSale.customer.phone || "" } : null,
    payments: (visibleSale?.payments || []).map((p) => ({ method: p.paymentMethod, amount: Number(p.amount || 0).toFixed(2), status: p.status })),
    buyback,
  };
}
