import mongoose from "mongoose";
import { Product, StockLedger, Store, StoreInventory } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";
import { assertObjectId, toObjectId } from "../../utils/ids.js";

function toMoney(value) {
  return Number(value || 0).toFixed(2);
}

function buildStatus(quantity, minStockLevel) {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= minStockLevel) return "low_stock";
  return "in_stock";
}

function mapInventoryItem(store, item, updatedAt) {
  const product = item.product;
  const quantity = Number(item.quantity || 0);
  const minStockLevel = Number(item.minStockLevel || 0);
  const finalPrice = Math.max(
    0,
    Number(product.unitPrice || 0) - Number(product.discount || 0),
  );

  return {
    store_id: store._id.toString(),
    store_name: store.name,
    product_id: product._id.toString(),
    job_id: product.jobId || product.jobNumber || "",
    product_code: product.productCode || "",
    sku: product.sku,
    barcode: product.barcode || product.sku,
    imei: product.imei || "",
    serial_number: product.serialNumber || "",
    name: product.name,
    brand: product.brand || "",
    model: product.model || "",
    category: product.category,
    variant: product.variant || "",
    ram: product.ram || "",
    storage: product.storage || "",
    color: product.color || "",
    condition: product.condition || "new",
    purchase_price: toMoney(product.purchasePrice),
    unit_price: toMoney(product.unitPrice),
    selling_price: toMoney(product.unitPrice),
    discount: toMoney(product.discount),
    tax: toMoney(product.taxRate),
    final_price: toMoney(finalPrice),
    quantity,
    reserved_quantity: Number(item.reservedQuantity || 0),
    min_stock_level: minStockLevel,
    stock_status: buildStatus(quantity, minStockLevel),
    supplier_name: product.supplierName || "",
    supplier_contact: product.supplierContact || "",
    purchase_date: product.purchaseDate ? product.purchaseDate.toISOString().slice(0, 10) : "",
    images: product.images || [],
    remarks: product.remarks || "",
    device_notes: product.deviceNotes || "",
    updated_at: updatedAt,
  };
}

function rowMatches(row, search) {
  if (!search) return true;
  const q = search.toLowerCase();
  return [
    row.job_id,
    row.product_code,
    row.sku,
    row.barcode,
    row.imei,
    row.serial_number,
    row.name,
    row.brand,
    row.model,
    row.category,
  ].some((value) => String(value || "").toLowerCase().includes(q));
}

async function requireStore(storeId) {
  const store = await Store.findOne({ _id: toObjectId(storeId, "STORE_INVALID_ID"), isActive: { $ne: false } });
  if (!store) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  }
  return store;
}

async function requireProduct(productId) {
  const product = await Product.findOne({ _id: toObjectId(productId, "PRODUCT_INVALID_ID"), isActive: true });
  if (!product) {
    throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
  }
  return product;
}

export async function listActiveStores() {
  const stores = await Store.find({ isActive: { $ne: false } }).sort({ name: 1 });
  return stores.map((s) => ({
    id: s._id.toString(),
    code: s.code,
    name: s.name,
    parent_store_id: s.parentStore ? s.parentStore.toString() : null,
    is_active: s.isActive,
    created_at: s.createdAt,
  }));
}

export async function listStoreInventory(storeId, options = {}) {
  const store = await requireStore(storeId);
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 500));
  const offset = Math.max(0, Number(options.offset || 0));

  const inventory = await StoreInventory.findOne({ store: store._id })
    .populate({
      path: "items.product",
      match: { isActive: true },
    });

  if (!inventory) {
    return { rows: [], total: 0, limit, offset };
  }

  let rows = inventory.items
    .filter((item) => item.product)
    .map((item) => mapInventoryItem(store, item, inventory.updatedAt))
    .filter((row) => rowMatches(row, options.search || ""))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (options.category) {
    rows = rows.filter((row) => row.category === options.category);
  }

  if (options.stockStatus) {
    rows = rows.filter((row) => row.stock_status === options.stockStatus);
  }

  const total = rows.length;
  return { rows: rows.slice(offset, offset + limit), total, limit, offset };
}

export async function listLowStock(storeId) {
  const result = await listStoreInventory(storeId, { stockStatus: "low_stock", limit: 500 });
  return result.rows;
}

export async function adjustInventory(input) {
  return withTransaction(async (session) => {
    await requireStore(input.storeId);
    await requireProduct(input.productId);

    const storeObjectId = toObjectId(input.storeId, "STORE_INVALID_ID");
    const productObjectId = toObjectId(input.productId, "PRODUCT_INVALID_ID");

    let inventory = await StoreInventory.findOne({ store: storeObjectId }).session(session);

    if (!inventory) {
      inventory = new StoreInventory({ store: storeObjectId, items: [] });
    }

    const itemIndex = inventory.items.findIndex(
      (item) => item.product.toString() === productObjectId.toString(),
    );

    if (itemIndex === -1 && input.delta < 0) {
      throw new HttpError(400, "Cannot reduce inventory below zero", "INVENTORY_NEGATIVE_STOCK");
    }

    let nextQuantity;

    if (itemIndex === -1) {
      nextQuantity = input.delta;
      inventory.items.push({
        product: productObjectId,
        quantity: nextQuantity,
        reservedQuantity: 0,
        minStockLevel: Math.max(0, Number(input.minStockLevel || 0)),
      });
    } else {
      nextQuantity = inventory.items[itemIndex].quantity + input.delta;
      if (nextQuantity < 0) {
        throw new HttpError(400, "Cannot reduce inventory below zero", "INVENTORY_NEGATIVE_STOCK");
      }
      inventory.items[itemIndex].quantity = nextQuantity;
      if (input.minStockLevel !== undefined) {
        inventory.items[itemIndex].minStockLevel = Math.max(0, Number(input.minStockLevel));
      }
    }

    inventory.updatedAt = new Date();
    await inventory.save({ session });

    await StockLedger.create([{
      store: storeObjectId,
      product: productObjectId,
      movementType: input.delta > 0 ? "in" : "out",
      quantity: Math.abs(input.delta),
      referenceType: "inventory_adjustment",
      referenceId: new mongoose.Types.ObjectId("000000000000000000000000"),
      note: input.reason,
      createdBy: input.userId,
    }], { session });

    return {
      storeId: input.storeId.toString(),
      productId: input.productId.toString(),
      quantity: nextQuantity,
    };
  });
}

export async function transferStock(input) {
  assertObjectId(input.fromStoreId, "STORE_INVALID_ID");
  assertObjectId(input.toStoreId, "STORE_INVALID_ID");
  assertObjectId(input.productId, "PRODUCT_INVALID_ID");

  if (input.fromStoreId === input.toStoreId) {
    throw new HttpError(400, "Source and destination stores must be different", "TRANSFER_SAME_STORE");
  }

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new HttpError(400, "Transfer quantity must be greater than zero", "TRANSFER_INVALID_QUANTITY");
  }

  return withTransaction(async (session) => {
    await requireStore(input.fromStoreId);
    await requireStore(input.toStoreId);
    await requireProduct(input.productId);

    const fromStore = toObjectId(input.fromStoreId, "STORE_INVALID_ID");
    const toStore = toObjectId(input.toStoreId, "STORE_INVALID_ID");
    const product = toObjectId(input.productId, "PRODUCT_INVALID_ID");

    const source = await StoreInventory.findOneAndUpdate(
      {
        store: fromStore,
        items: {
          $elemMatch: {
            product,
            quantity: { $gte: input.quantity },
          },
        },
      },
      {
        $inc: { "items.$.quantity": -input.quantity },
        $set: { updatedAt: new Date() },
      },
      { session, returnDocument: "after" },
    );

    if (!source) {
      throw new HttpError(409, "Insufficient stock for transfer", "TRANSFER_INSUFFICIENT_STOCK");
    }

    const destination = await StoreInventory.findOneAndUpdate(
      { store: toStore, "items.product": product },
      {
        $inc: { "items.$.quantity": input.quantity },
        $set: { updatedAt: new Date() },
      },
      { session, returnDocument: "after" },
    );

    if (!destination) {
      await StoreInventory.findOneAndUpdate(
        { store: toStore },
        {
          $push: {
            items: {
              product,
              quantity: input.quantity,
              reservedQuantity: 0,
              minStockLevel: 0,
            },
          },
          $set: { updatedAt: new Date() },
        },
        { upsert: true, session, returnDocument: "after" },
      );
    }

    const referenceId = new mongoose.Types.ObjectId();
    await StockLedger.create([
      {
        store: fromStore,
        product,
        movementType: "transfer_out",
        quantity: input.quantity,
        referenceType: "stock_transfer",
        referenceId,
        reason: input.reason,
        note: input.reason,
        createdBy: input.userId,
      },
      {
        store: toStore,
        product,
        movementType: "transfer_in",
        quantity: input.quantity,
        referenceType: "stock_transfer",
        referenceId,
        reason: input.reason,
        note: input.reason,
        createdBy: input.userId,
      },
    ], { session });

    return {
      id: referenceId.toString(),
      from_store_id: input.fromStoreId,
      to_store_id: input.toStoreId,
      product_id: input.productId,
      quantity: input.quantity,
      reason: input.reason,
    };
  });
}
