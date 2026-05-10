import mongoose from "mongoose";
import { Sale, Product, Store, Customer, Employee, StoreInventory, StockLedger, User, Role } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";

function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new HttpError(400, "Invalid numeric amount", "INVALID_MONEY_VALUE");
  }
  return Math.round(n * 100);
}

function centsToMoney(cents) {
  return (cents / 100).toFixed(2);
}

function todayStamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function mergeItems(items) {
  const map = new Map();
  items.forEach((item) => {
    const pid = item.productId.toString();
    map.set(pid, (map.get(pid) || 0) + item.quantity);
  });

  return Array.from(map.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

async function requireStore(storeId) {
  const store = await Store.findOne({ _id: storeId, isActive: { $ne: false } });
  if (!store) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  }
}

async function requireCustomer(customerId) {
  const customer = await Customer.findById(customerId);
  if (!customer) {
    throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }
}

async function requireEmployeeForUser(userId, storeId) {
  const employee = await Employee.findOne({ user: userId, store: storeId, isActive: true });
  if (employee) return employee;

  const user = await User.findById(userId).populate('roles');
  const isAdmin = user && user.roles.some(r => r.name === 'admin');
  if (isAdmin) {
    const storeEmployee = await Employee.findOne({ store: storeId, isActive: true }).sort({ _id: 1 });
    if (storeEmployee) return storeEmployee;
  }

  throw new HttpError(
    403,
    "Authenticated user is not an active employee of the selected store",
    "SALE_EMPLOYEE_STORE_MISMATCH",
  );
}

export async function createSale(input) {
  if (input.items.length === 0) {
    throw new HttpError(
      400,
      "At least one sale item is required",
      "SALE_ITEMS_REQUIRED",
    );
  }

  const mergedItems = mergeItems(input.items);
  const productIds = mergedItems.map((item) => item.productId);

  return withTransaction(async (session) => {
    await requireStore(input.storeId);

    if (input.customerId) {
      await requireCustomer(input.customerId);
    }

    const employee = await requireEmployeeForUser(input.userId, input.storeId);

    const products = await Product.find({
      _id: { $in: productIds },
      isActive: true
    }).session(session);

    if (products.length !== productIds.length) {
      throw new HttpError(
        400,
        "One or more products are invalid or inactive",
        "SALE_INVALID_PRODUCT",
      );
    }

    const productMap = new Map();
    products.forEach((p) => {
      productMap.set(p._id.toString(), p);
    });

    const stockManagedProductIds = products
      .filter((p) => p.category !== "service")
      .map((p) => p._id.toString());

    const inventoryByProductId = new Map();
    if (stockManagedProductIds.length > 0) {
      const inventories = await StoreInventory.find({
        store: input.storeId,
        "items.product": { $in: stockManagedProductIds }
      }).session(session);

      inventories.forEach(inv => {
        inv.items.forEach(item => {
          if (stockManagedProductIds.includes(item.product.toString())) {
            inventoryByProductId.set(item.product.toString(), item.quantity);
          }
        });
      });

      for (const pid of stockManagedProductIds) {
        if (!inventoryByProductId.has(pid)) {
          throw new HttpError(
            400,
            `Product ${pid} is missing in store inventory`,
            "SALE_MISSING_STORE_INVENTORY",
          );
        }
      }
    }

    const discountCents = toCents(input.discountTotal || 0);
    const exchangeCents = toCents(input.exchangeTotal || 0);

    if (discountCents < 0 || exchangeCents < 0) {
      throw new HttpError(
        400,
        "Discount and exchange must be non-negative",
        "SALE_INVALID_DISCOUNT_EXCHANGE",
      );
    }

    let subtotalCents = 0;
    let taxTotalCents = 0;

    const computedItems = mergedItems.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new HttpError(
          400,
          `Product ${item.productId} not found`,
          "SALE_PRODUCT_NOT_FOUND",
        );
      }

      if (item.quantity <= 0) {
        throw new HttpError(
          400,
          "Sale item quantity must be greater than zero",
          "SALE_INVALID_QUANTITY",
        );
      }

      const availableQuantity = inventoryByProductId.get(item.productId) || 0;
      if (product.category !== "service" && item.quantity > availableQuantity) {
        throw new HttpError(
          400,
          `Insufficient stock for ${product.name}. Available: ${availableQuantity}`,
          "SALE_INSUFFICIENT_STOCK",
        );
      }

      const unitPriceCents = toCents(product.unitPrice);
      const taxRate = Number(product.taxRate);
      const lineSubtotalCents = unitPriceCents * item.quantity;
      const lineTaxCents = Math.round((lineSubtotalCents * taxRate) / 100);
      const lineTotalCents = lineSubtotalCents + lineTaxCents;

      subtotalCents += lineSubtotalCents;
      taxTotalCents += lineTaxCents;

      return {
        product: item.productId,
        quantity: item.quantity,
        category: product.category,
        unitPrice: Number(centsToMoney(unitPriceCents)),
        taxRate,
        taxAmount: Number(centsToMoney(lineTaxCents)),
        discountAmount: 0,
        lineTotal: Number(centsToMoney(lineTotalCents)),
      };
    });

    const grandTotalCents = subtotalCents + taxTotalCents - discountCents - exchangeCents;
    if (grandTotalCents < 0) {
      throw new HttpError(
        400,
        "Grand total cannot be negative",
        "SALE_NEGATIVE_TOTAL",
      );
    }

    const paidCents = input.payments.reduce(
      (sum, payment) => sum + toCents(payment.amount),
      0,
    );

    if (paidCents > grandTotalCents) {
      throw new HttpError(
        400,
        "Payment total cannot exceed sale grand total",
        "SALE_PAYMENT_EXCEEDS_TOTAL",
      );
    }

    const paymentStatus = paidCents <= 0 ? "pending" : paidCents < grandTotalCents ? "partial" : "paid";

    const [sale] = await Sale.create([{
      saleNo: "SALE-PENDING",
      store: input.storeId,
      customer: input.customerId || null,
      employee: employee._id,
      status: 'completed',
      subtotal: Number(centsToMoney(subtotalCents)),
      taxTotal: Number(centsToMoney(taxTotalCents)),
      discountTotal: Number(centsToMoney(discountCents)),
      exchangeTotal: Number(centsToMoney(exchangeCents)),
      grandTotal: Number(centsToMoney(grandTotalCents)),
      amountPaid: Number(centsToMoney(paidCents)),
      paymentStatus,
      note: input.note || null,
      jobNumber: input.jobNumber || null,
      icNumber: input.icNumber || null,
      cashAmount: Number(centsToMoney(toCents(input.cashAmount || 0))),
      onlineAmount: Number(centsToMoney(toCents(input.onlineAmount || 0))),
      exchangeModel: input.exchangeModel || null,
      gotAmount: Number(centsToMoney(toCents(input.gotAmount || 0))),
      gift: input.gift || null,
      salespersonName: input.salespersonName || null,
      items: computedItems,
      payments: input.payments.map(p => ({
        paymentMethod: p.paymentMethod,
        status: 'paid',
        amount: Number(centsToMoney(toCents(p.amount))),
        referenceNo: p.referenceNo || null,
        notes: p.notes || null,
        createdBy: input.userId,
      }))
    }], { session });

    const finalSaleNo = `SAL-${todayStamp()}-${sale._id.toString().slice(-6).toUpperCase()}`;
    sale.saleNo = finalSaleNo;
    await sale.save({ session });

    for (const item of computedItems) {
      if (item.category !== "service") {
        const updatedInv = await StoreInventory.findOneAndUpdate(
          { 
            store: new mongoose.Types.ObjectId(input.storeId), 
            items: { 
              $elemMatch: { 
                product: new mongoose.Types.ObjectId(item.product), 
                quantity: { $gte: item.quantity } 
              } 
            } 
          },
          { 
            $inc: { "items.$.quantity": -item.quantity },
            $set: { updatedAt: new Date() }
          },
          { session, returnDocument: "after" }
        );

        if (!updatedInv) {
          throw new HttpError(
            409,
            "Concurrent stock update conflict or insufficient stock detected",
            "SALE_STOCK_CONFLICT",
          );
        }

        await StockLedger.create([{
          store: input.storeId,
          product: item.product,
          movementType: 'out',
          quantity: item.quantity,
          referenceType: 'sale',
          referenceId: sale._id,
          note: `Sale ${finalSaleNo}`,
          createdBy: input.userId,
        }], { session });
      }
    }

    return {
      sale: sale.toObject(),
      items: sale.items,
      payments: sale.payments,
    };
  });
}

export async function getSaleById(saleId) {
  const sale = await Sale.findById(saleId);
  if (!sale) {
    throw new HttpError(404, "Sale not found", "SALE_NOT_FOUND");
  }

  return {
    sale: sale.toObject(),
    items: sale.items,
    payments: sale.payments,
  };
}

export async function listSales(input) {
  const limit = Math.max(1, Math.min(input?.limit || 200, 500));
  const offset = Math.max(0, input?.offset || 0);

  const query = {};
  if (input?.storeId) {
    query.store = input.storeId;
  }

  const sales = await Sale.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);

  return sales.map(s => {
    const obj = s.toObject();
    obj.id = s._id.toString();
    obj.item_count = s.items.reduce((sum, item) => sum + item.quantity, 0);
    return obj;
  });
}

export async function updateSale(saleId, input) {
  return withTransaction(async (session) => {
    const sale = await Sale.findById(saleId).session(session);
    if (!sale) {
      throw new HttpError(404, "Sale not found", "SALE_NOT_FOUND");
    }

    if (input.storeId !== undefined && input.storeId.toString() !== sale.store.toString()) {
      throw new HttpError(
        409,
        "Store cannot be changed for an existing sale",
        "SALE_STORE_IMMUTABLE",
      );
    }

    if (input.customerId !== undefined && input.customerId !== null) {
      await requireCustomer(input.customerId);
    }

    const exchangeCents = toCents(sale.exchangeTotal);
    const existingCashCents = sale.payments
      .filter((p) => p.paymentMethod === "cash")
      .reduce((sum, p) => sum + toCents(p.amount), 0);
    const existingWalletCents = sale.payments
      .filter((p) => p.paymentMethod === "wallet")
      .reduce((sum, p) => sum + toCents(p.amount), 0);
    const existingOnlineCents = sale.payments
      .filter((p) => p.paymentMethod !== "cash" && p.paymentMethod !== "wallet")
      .reduce((sum, p) => sum + toCents(p.amount), 0);

    const cashCents = input.cashAmount !== undefined ? toCents(input.cashAmount) : existingCashCents;
    const onlineCents = input.onlineAmount !== undefined ? toCents(input.onlineAmount) : existingOnlineCents;
    const walletCents = existingWalletCents > 0 ? existingWalletCents : exchangeCents;

    const paidCents = cashCents + onlineCents + walletCents;
    const grandTotalCents = toCents(sale.grandTotal);
    if (paidCents > grandTotalCents) {
      throw new HttpError(
        400,
        "Payment total cannot exceed sale grand total",
        "SALE_PAYMENT_EXCEEDS_TOTAL",
      );
    }

    const paymentStatus = paidCents <= 0 ? "pending" : paidCents < grandTotalCents ? "partial" : "paid";

    sale.customer = input.customerId === undefined ? sale.customer : input.customerId;
    sale.amountPaid = Number(centsToMoney(paidCents));
    sale.paymentStatus = paymentStatus;
    if (input.note !== undefined) sale.note = input.note;

    sale.payments = [];

    if (cashCents > 0) {
      sale.payments.push({
        paymentMethod: 'cash',
        status: 'paid',
        amount: Number(centsToMoney(cashCents)),
        createdBy: input.userId
      });
    }

    if (onlineCents > 0) {
      sale.payments.push({
        paymentMethod: 'bank_transfer',
        status: 'paid',
        amount: Number(centsToMoney(onlineCents)),
        createdBy: input.userId
      });
    }

    if (walletCents > 0) {
      sale.payments.push({
        paymentMethod: 'wallet',
        status: 'paid',
        amount: Number(centsToMoney(walletCents)),
        notes: 'exchange credit',
        createdBy: input.userId
      });
    }

    await sale.save({ session });

    return {
      sale: sale.toObject(),
      items: sale.items,
      payments: sale.payments,
    };
  });
}

export async function deleteSale(saleId, userId) {
  return withTransaction(async (session) => {
    const sale = await Sale.findById(saleId).populate('items.product').session(session);
    if (!sale) {
      throw new HttpError(404, "Sale not found", "SALE_NOT_FOUND");
    }

    for (const item of sale.items) {
      if (item.product.category !== "service") {
        await StoreInventory.findOneAndUpdate(
          { 
            store: new mongoose.Types.ObjectId(sale.store), 
            "items.product": new mongoose.Types.ObjectId(item.product._id) 
          },
          { 
            $inc: { "items.$.quantity": item.quantity },
            $set: { updatedAt: new Date() }
          },
          { session }
        );

        await StockLedger.create([{
          store: sale.store,
          product: item.product._id,
          movementType: 'in',
          quantity: item.quantity,
          referenceType: 'sale_reversal',
          referenceId: sale._id,
          note: `Sale ${sale.saleNo} deleted and stock restored`,
          createdBy: userId,
        }], { session });
      }
    }

    await Sale.deleteOne({ _id: saleId }).session(session);
  });
}
