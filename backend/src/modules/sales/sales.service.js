import mongoose from "mongoose";
import {
  BulkInventory, Buyback, Customer, Employee, ExchangeDevice,
  PriceAdjustment, Product, Sale, SerializedInventory,
  StockLedger, Store, StoreInventory, User,
} from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";
import { writeAudit } from "../../utils/audit.js";

// ─── Money helpers ────────────────────────────────────────────────────────────

function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, "Invalid numeric amount", "INVALID_MONEY_VALUE");
  return Math.round(n * 100);
}

function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

function todayStamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
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

    const finalSaleNo = `SAL-${todayStamp()}-${sale._id.toString().slice(-6).toUpperCase()}`;
    sale.saleNo = finalSaleNo;
    await sale.save({ session });

    const ctx = { userId: input.userId, employeeId: employee._id, storeId: input.storeId };

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

    // ── ExchangeDevice records + optional Buyback ──────────────────────────
    if (input.exchangeDevices && input.exchangeDevices.length > 0) {
      for (const dev of input.exchangeDevices) {
        let buybackRef = null;

        if (dev.imei) {
          // Auto-create buyback entry if IMEI is provided
          try {
            const [bb] = await Buyback.create([{
              imei:            dev.imei,
              brand:           dev.brand,
              model:           dev.model,
              color:           dev.color || "",
              customer:        input.customerId || null,
              store:           input.storeId,
              condition:       dev.condition || "good",
              marketValue:     dev.marketValue || dev.exchangeValue,
              negotiatedPrice: dev.exchangeValue,
              status:          "accepted",
              notes:           `Exchange from sale ${finalSaleNo}. ${dev.conditionNotes || ""}`.trim(),
              createdBy:       input.userId,
            }], { session });
            buybackRef = bb._id;
          } catch {
            // Duplicate IMEI in buyback — skip auto-creation, staff will handle manually
          }
        }

        await ExchangeDevice.create([{
          sale:            sale._id,
          customer:        input.customerId || null,
          store:           input.storeId,
          employee:        employee._id,
          brand:           dev.brand,
          model:           dev.model,
          imei:            dev.imei  || null,
          storageCapacity: dev.storageCapacity || null,
          color:           dev.color || null,
          condition:       dev.condition || "good",
          conditionNotes:  dev.conditionNotes || null,
          marketValue:     dev.marketValue || 0,
          exchangeValue:   dev.exchangeValue,
          buybackRef,
          buybackStatus:   "received",
        }], { session });
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

// ─── listSales ────────────────────────────────────────────────────────────────

export async function listSales(input) {
  const limit  = Math.max(1, Math.min(input?.limit  || 5000, 5000));
  const offset = Math.max(0, input?.offset || 0);
  const query  = {};
  if (input?.storeId) query.store = input.storeId;

  const sales = await Sale.find({ ...query, status: "completed" })
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
    customer_name:   sale.customer?.fullName || "Walk-in",
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
    const existingOnlineCents= sale.payments.filter((p) => p.paymentMethod !== "cash" && p.paymentMethod !== "wallet").reduce((s, p) => s + toCents(p.amount), 0);
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

    sale.payments = [];
    if (cashCents   > 0) sale.payments.push({ paymentMethod: "cash",          status: "paid", amount: fromCents(cashCents),   createdBy: input.userId });
    if (onlineCents > 0) sale.payments.push({ paymentMethod: "bank_transfer", status: "paid", amount: fromCents(onlineCents), createdBy: input.userId });
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
      await BulkInventory.findOneAndUpdate({ store: sale.store, product: item.product._id }, { $set: { quantity: 1, reservedQuantity: 0, updatedAt: new Date() } }, { upsert: true, session });
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
