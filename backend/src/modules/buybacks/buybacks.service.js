import mongoose from "mongoose";
import { Buyback, Store, Customer, Product, StoreInventory, StockLedger, PaymentEntry } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";

function toMoney(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, "Invalid money value", "BUYBACK_INVALID_AMOUNT");
  }
  return parsed.toFixed(2);
}

function toDbCondition(condition) {
  return condition.toLowerCase();
}

function toDbStatus(status) {
  return status.toLowerCase();
}

function toApiCondition(condition) {
  if (condition === "excellent") return "Excellent";
  if (condition === "good") return "Good";
  if (condition === "fair") return "Fair";
  return "Poor";
}

function toApiStatus(status) {
  if (status === "accepted") return "Accepted";
  if (status === "processed") return "Processed";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function mapBuyback(doc) {
  return {
    id: doc._id.toString(),
    imei: doc.imei,
    brand: doc.brand,
    model: doc.model,
    color: doc.color || "",
    customer: doc.customer ? doc.customer.toString() : null,
    store_ref: doc.store ? doc.store.toString() : null,
    job_no: doc.jobNo || "",
    ic_number: doc.icNumber || "",
    cash_amount: toMoney(doc.cashAmount),
    online_amount: toMoney(doc.onlineAmount),
    exchange_amount: toMoney(doc.exchangeAmount),
    exchange_model: doc.exchangeModel || "",
    condition: toApiCondition(doc.condition),
    market_value: toMoney(doc.marketValue),
    negotiated_price: toMoney(doc.negotiatedPrice),
    status: toApiStatus(doc.status),
    created_at: doc.createdAt,
  };
}

async function requireStore(storeId) {
  const store = await Store.findOne({ _id: new mongoose.Types.ObjectId(storeId), isActive: { $ne: false } });
  if (!store) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  }
}

async function requireCustomer(customerId) {
  const customer = await Customer.findById(new mongoose.Types.ObjectId(customerId));
  if (!customer) {
    throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }
}

async function processBuybackIntoInventory(buyback, userId, session) {
  const storeId = buyback.store;
  if (!storeId) {
    throw new HttpError(
      400,
      "Store is required before processing buyback",
      "BUYBACK_STORE_REQUIRED",
    );
  }

  let productId = buyback.inventoryProduct;

  if (!productId) {
    const existingProduct = await Product.findOne({ imei: buyback.imei }).session(session);

    if (existingProduct) {
      productId = existingProduct._id;
    } else {
      const sku = `USED-${buyback._id.toString().slice(-6).toUpperCase()}`;
      const name = `${buyback.brand} ${buyback.model}`.trim();

      const [newProduct] = await Product.create([{
        sku,
        imei: buyback.imei,
        name,
        category: 'used_phone',
        unitPrice: Number(toMoney(buyback.negotiatedPrice)),
        taxRate: 0,
        isActive: true
      }], { session });

      productId = newProduct._id;
    }

    buyback.inventoryProduct = productId;
    await buyback.save({ session });
  }

  const storeObjectId = new mongoose.Types.ObjectId(storeId);
  const productObjectId = new mongoose.Types.ObjectId(productId);

  const res = await StoreInventory.findOneAndUpdate(
    { store: storeObjectId, "items.product": productObjectId },
    { 
      $inc: { "items.$.quantity": 1 },
      $set: { updatedAt: new Date() }
    },
    { session, returnDocument: "after" }
  );

  if (!res) {
    await StoreInventory.findOneAndUpdate(
      { store: storeObjectId },
      { 
        $push: { 
          items: { 
            product: productObjectId, 
            quantity: 1, 
            reservedQuantity: 0, 
            minStockLevel: 0 
          } 
        },
        $set: { updatedAt: new Date() }
      },
      { upsert: true, session }
    );
  }

  await StockLedger.create([{
    store: storeObjectId,
    product: productObjectId,
    movementType: 'in',
    quantity: 1,
    referenceType: 'buyback',
    referenceId: buyback._id,
    note: `Buyback processed for IMEI ${buyback.imei}`,
    createdBy: userId,
  }], { session });

  const cash = Number(buyback.cashAmount || 0);
  const online = Number(buyback.onlineAmount || 0);

  if (cash > 0 || online > 0) {
    const existingPaymentEntry = await PaymentEntry.findOne({
      sourceType: 'buyback',
      sourceId: buyback._id
    }).session(session);

    if (!existingPaymentEntry) {
      await PaymentEntry.create([{
        store: storeObjectId,
        entryType: 'out',
        dealerName: `Buyback ${buyback.imei}`,
        cashAmount: Number(toMoney(cash)),
        onlineAmount: Number(toMoney(online)),
        paymentStatus: 'paid',
        outstandingAmount: 0,
        entryDate: new Date(),
        sourceType: 'buyback',
        sourceId: buyback._id,
        notes: `Payout for processed buyback ${buyback.imei}`,
        createdBy: userId,
      }], { session });
    }
  }
}

export async function listBuybacks(input = {}) {
  const query = input.storeId ? { store: input.storeId } : {};
  const buybacks = await Buyback.find(query).sort({ createdAt: -1 });
  return buybacks.map(mapBuyback);
}

export async function createBuyback(input, userId) {
  return withTransaction(async (session) => {
    const imei = input.imei.trim();
    if (!/^\d{15}$/.test(imei)) {
      throw new HttpError(
        400,
        "IMEI must contain exactly 15 digits",
        "BUYBACK_INVALID_IMEI",
      );
    }

    const brand = input.brand.trim();
    const model = input.model.trim();
    if (!brand || !model) {
      throw new HttpError(
        400,
        "Brand and model are required",
        "BUYBACK_REQUIRED_DEVICE_FIELDS",
      );
    }

    if (input.storeRef) {
      await requireStore(input.storeRef);
    }

    if (input.customer) {
      await requireCustomer(input.customer);
    }

    const existingBuyback = await Buyback.findOne({ imei }).session(session);
    if (existingBuyback) {
      throw new HttpError(
        409,
        "IMEI already exists in buybacks",
        "BUYBACK_DUPLICATE_IMEI",
      );
    }

    const [buyback] = await Buyback.create([{
      imei,
      brand,
      model,
      color: (input.color || "").trim() || null,
      customer: input.customer ? new mongoose.Types.ObjectId(input.customer) : null,
      store: input.storeRef ? new mongoose.Types.ObjectId(input.storeRef) : null,
      jobNo: (input.jobNo || "").trim() || null,
      icNumber: (input.icNumber || "").trim() || null,
      cashAmount: Number(toMoney(input.cashAmount)),
      onlineAmount: Number(toMoney(input.onlineAmount)),
      exchangeAmount: Number(toMoney(input.exchangeAmount)),
      exchangeModel: (input.exchangeModel || "").trim() || null,
      condition: toDbCondition(input.condition),
      marketValue: Number(toMoney(input.marketValue)),
      negotiatedPrice: Number(toMoney(input.negotiatedPrice)),
      status: toDbStatus(input.status || "Pending"),
      createdBy: userId,
    }], { session });

    if (buyback.status === "processed") {
      await processBuybackIntoInventory(buyback, userId, session);
    }

    return mapBuyback(buyback);
  });
}

export async function updateBuyback(buybackId, input, userId) {
  return withTransaction(async (session) => {
    const buyback = await Buyback.findById(new mongoose.Types.ObjectId(buybackId)).session(session);
    if (!buyback) {
      throw new HttpError(404, "Buyback not found", "BUYBACK_NOT_FOUND");
    }

    const nextStatus = input.status ? toDbStatus(input.status) : buyback.status;

    if (buyback.status === "processed" && nextStatus !== "processed") {
      throw new HttpError(
        409,
        "Processed buyback cannot move to another status",
        "BUYBACK_STATUS_LOCKED",
      );
    }

    const nextStoreId = input.storeRef !== undefined ? (input.storeRef ? new mongoose.Types.ObjectId(input.storeRef) : null) : buyback.store;
    const nextCustomerId = input.customer !== undefined ? (input.customer ? new mongoose.Types.ObjectId(input.customer) : null) : buyback.customer;

    if (nextStoreId) {
      await requireStore(nextStoreId);
    }

    if (nextCustomerId) {
      await requireCustomer(nextCustomerId);
    }

    const nextImei = input.imei !== undefined ? input.imei.trim() : buyback.imei;
    if (!/^\d{15}$/.test(nextImei)) {
      throw new HttpError(
        400,
        "IMEI must contain exactly 15 digits",
        "BUYBACK_INVALID_IMEI",
      );
    }

    const nextBrand = input.brand !== undefined ? input.brand.trim() : buyback.brand;
    const nextModel = input.model !== undefined ? input.model.trim() : buyback.model;
    if (!nextBrand || !nextModel) {
      throw new HttpError(
        400,
        "Brand and model are required",
        "BUYBACK_REQUIRED_DEVICE_FIELDS",
      );
    }

    const oldStatus = buyback.status;

    buyback.imei = nextImei;
    buyback.brand = nextBrand;
    buyback.model = nextModel;
    buyback.color = input.color !== undefined ? (input.color || "").trim() || null : buyback.color;
    buyback.customer = nextCustomerId;
    buyback.store = nextStoreId;
    buyback.jobNo = input.jobNo !== undefined ? (input.jobNo || "").trim() || null : buyback.jobNo;
    buyback.icNumber = input.icNumber !== undefined ? (input.icNumber || "").trim() || null : buyback.icNumber;
    buyback.cashAmount = input.cashAmount !== undefined ? Number(toMoney(input.cashAmount)) : buyback.cashAmount;
    buyback.onlineAmount = input.onlineAmount !== undefined ? Number(toMoney(input.onlineAmount)) : buyback.onlineAmount;
    buyback.exchangeAmount = input.exchangeAmount !== undefined ? Number(toMoney(input.exchangeAmount)) : buyback.exchangeAmount;
    buyback.exchangeModel = input.exchangeModel !== undefined ? (input.exchangeModel || "").trim() || null : buyback.exchangeModel;
    buyback.condition = input.condition !== undefined ? toDbCondition(input.condition) : buyback.condition;
    buyback.marketValue = input.marketValue !== undefined ? Number(toMoney(input.marketValue)) : buyback.marketValue;
    buyback.negotiatedPrice = input.negotiatedPrice !== undefined ? Number(toMoney(input.negotiatedPrice)) : buyback.negotiatedPrice;
    buyback.status = nextStatus;

    await buyback.save({ session });

    if (oldStatus !== "processed" && buyback.status === "processed") {
      await processBuybackIntoInventory(buyback, userId, session);
    }

    return mapBuyback(buyback);
  });
}

export async function deleteBuyback(buybackId) {
  return withTransaction(async (session) => {
    const buyback = await Buyback.findById(new mongoose.Types.ObjectId(buybackId)).session(session);
    if (!buyback) {
      throw new HttpError(404, "Buyback not found", "BUYBACK_NOT_FOUND");
    }

    if (buyback.status === "processed") {
      throw new HttpError(
        409,
        "Processed buybacks cannot be deleted",
        "BUYBACK_DELETE_FORBIDDEN",
      );
    }

    await Buyback.deleteOne({ _id: new mongoose.Types.ObjectId(buybackId) }).session(session);
  });
}
