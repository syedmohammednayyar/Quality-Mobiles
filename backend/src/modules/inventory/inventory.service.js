import mongoose from "mongoose";
import { BulkInventory, Product, SerializedInventory, StockLedger, Store, StoreInventory } from "../../db/models.js";
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
    network_type: product.networkType || "",
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
    inventory_status: quantity <= 0 ? "sold" : (product.inventoryStatus || "ready"),
    inventory_mode: product.inventoryMode || "bulk",
    active: Boolean(product.isActive),
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
  const [products, bulkRows, serializedRows, legacyInventory] = await Promise.all([
    Product.find({ isActive: true }).sort({ name: 1 }),
    BulkInventory.find({ store: store._id }).lean(),
    SerializedInventory.aggregate([
      { $match: { store: store._id, status: "in_stock" } },
      {
        $group: {
          _id: "$product",
          quantity: { $sum: 1 },
          updatedAt: { $max: "$updatedAt" },
        },
      },
    ]),
    StoreInventory.findOne({ store: store._id }).populate({
      path: "items.product",
      match: { isActive: true },
    }),
  ]);

  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  const rows = [];

  bulkRows.forEach((item) => {
    const product = productMap.get(String(item.product));
    if (!product) return;
    rows.push(mapInventoryItem(store, {
      product,
      quantity: Number(item.quantity || 0),
      reservedQuantity: Number(item.reservedQuantity || 0),
      minStockLevel: Number(item.minStockLevel || 0),
    }, item.updatedAt || new Date().toISOString()));
  });

  serializedRows.forEach((item) => {
    const product = productMap.get(String(item._id));
    if (!product) return;
    rows.push(mapInventoryItem(store, {
      product,
      quantity: Number(item.quantity || 0),
      reservedQuantity: 0,
      minStockLevel: 0,
    }, item.updatedAt || new Date().toISOString()));
  });

  if (rows.length === 0 && legacyInventory) {
    legacyInventory.items
      .filter((item) => item.product)
      .forEach((item) => {
        rows.push(mapInventoryItem(store, item, legacyInventory.updatedAt));
      });
  }

  let filteredRows = rows
    .filter((row) => rowMatches(row, options.search || ""))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (options.category) {
    filteredRows = filteredRows.filter((row) => row.category === options.category);
  }

  if (options.stockStatus) {
    filteredRows = filteredRows.filter((row) => row.stock_status === options.stockStatus);
  }

  const total = filteredRows.length;
  return { rows: filteredRows.slice(offset, offset + limit), total, limit, offset };
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
    const toStoreDoc = await requireStore(input.toStoreId);
    const productDoc = await requireProduct(input.productId);
    if (!productDoc.isActive) {
      throw new HttpError(409, "Inactive products cannot be transferred", "TRANSFER_INACTIVE_PRODUCT");
    }
    if (productDoc.inventoryStatus === "sold") {
      throw new HttpError(409, "Sold products cannot be transferred", "TRANSFER_SOLD_PRODUCT");
    }

    const fromStore = toObjectId(input.fromStoreId, "STORE_INVALID_ID");
    const toStore = toObjectId(input.toStoreId, "STORE_INVALID_ID");
    const product = toObjectId(input.productId, "PRODUCT_INVALID_ID");

    const sourceBulk = await BulkInventory.findOne(
      { store: fromStore, product, quantity: { $gte: input.quantity } },
    ).session(session);
    let sourceLegacy = null;

    if (!sourceBulk) {
      sourceLegacy = await StoreInventory.findOne(
        {
          store: fromStore,
          items: {
            $elemMatch: {
              product,
              quantity: { $gte: input.quantity },
            },
          },
        },
      ).session(session);
    }

    if (!sourceBulk && !sourceLegacy) {
      throw new HttpError(409, "Insufficient stock for transfer", "TRANSFER_INSUFFICIENT_STOCK");
    }

    await BulkInventory.deleteMany({ product, store: { $ne: fromStore } }).session(session);

    const movedBulk = sourceBulk ? await BulkInventory.findOneAndUpdate(
      { _id: sourceBulk._id },
      {
        $set: {
          store: toStore,
          quantity: 1,
          reservedQuantity: 0,
          updatedAt: new Date(),
          ...(input.userId ? { addedBy: input.userId } : {}),
        },
      },
      { session, returnDocument: "after" },
    ) : null;

    if (!movedBulk) {
      await BulkInventory.create([{
        store: toStore,
        product,
        quantity: 1,
        reservedQuantity: 0,
        minStockLevel: 0,
        addedBy: input.userId,
      }], { session });
    }

    await StoreInventory.updateMany(
      {},
      {
        $pull: { items: { product } },
        $set: { updatedAt: new Date() },
      },
      { session },
    );

    await StoreInventory.findOneAndUpdate(
      { store: toStore },
      {
        $push: {
          items: {
            product,
            quantity: 1,
            reservedQuantity: 0,
            minStockLevel: 0,
          },
        },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, session, returnDocument: "after" },
    );

    await Product.updateOne(
      { _id: product },
      {
        $set: {
          store: toStore,
          storeName: toStoreDoc.name,
          updatedAt: new Date(),
        },
      },
      { session },
    );

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

export async function listProductTransferHistory(productId) {
  assertObjectId(productId, "PRODUCT_INVALID_ID");
  const product = await Product.findById(toObjectId(productId, "PRODUCT_INVALID_ID")).lean();
  if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");

  const rows = await StockLedger.find({
    product: product._id,
    referenceType: "stock_transfer",
    movementType: "transfer_out",
  })
    .populate("store", "name")
    .populate("createdBy", "fullName username")
    .sort({ createdAt: -1 })
    .lean();

  const references = rows.map((row) => row.referenceId);
  const destinations = await StockLedger.find({
    referenceId: { $in: references },
    movementType: "transfer_in",
  }).populate("store", "name").lean();
  const destinationMap = new Map(destinations.map((row) => [String(row.referenceId), row.store]));

  return rows.map((row) => ({
    id: String(row.referenceId),
    product_id: String(product._id),
    job_number: product.jobId,
    from_store_id: String(row.store?._id || row.store),
    from_store_name: row.store?.name || "",
    to_store_id: String(destinationMap.get(String(row.referenceId))?._id || ""),
    to_store_name: destinationMap.get(String(row.referenceId))?.name || "",
    transferred_at: row.createdAt,
    transferred_by: row.createdBy?.fullName || row.createdBy?.username || "",
    remarks: row.note || row.reason || "",
    status: "completed",
  }));
}
