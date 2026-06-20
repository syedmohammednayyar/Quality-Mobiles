import mongoose from "mongoose";
import { BulkInventory, Product, Sale, SequenceCounter, SerializedInventory, StockLedger, Store, StoreInventory } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";
import { toObjectId } from "../../utils/ids.js";

function toMoney(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, "Invalid product price", "PRODUCT_INVALID_PRICE");
  }
  return parsed.toFixed(2);
}

function cleanText(value) {
  const text = String(value || "").trim();
  return text || undefined;
}

function apiCategoryToDb(category) {
  if (category === "accessories") return "accessory";
  if (category === "services") return "service";
  return category;
}

function dbCategoryToApi(category) {
  if (category === "accessory" || category === "repair_part") return "accessories";
  if (category === "service") return "services";
  return category;
}

function resolveInventoryMode(input) {
  if (input.inventoryMode === "serialized" || input.inventoryMode === "bulk") return input.inventoryMode;
  const category = apiCategoryToDb(input.category);
  if (["new_phone", "used_phone"].includes(category)) return "serialized";
  return "bulk";
}

async function nextSequence(key, prefix, width = 5) {
  const counter = await SequenceCounter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return `${prefix}${String(counter.value).padStart(width, "0")}`;
}

async function buildProductIdentity(input) {
  const year = new Date().getFullYear();
  return {
    jobId: cleanText(input.jobId) || await nextSequence("product_job", "JOB-", 5),
    productCode: cleanText(input.productCode) || await nextSequence(`product_code_${year}`, `QM-${year}-`, 4),
  };
}

async function mapProduct(doc, storeId = null) {
  let stockQuantity = 0;
  let primaryStoreRef = doc.store ? doc.store.toString() : null;
  let minStockLevel = 0;

  if (doc.inventoryMode === "serialized") {
    const serializedQuery = storeId
      ? { store: toObjectId(storeId, "STORE_INVALID_ID"), product: doc._id, status: "in_stock" }
      : { product: doc._id, status: "in_stock" };
    stockQuantity = await SerializedInventory.countDocuments(serializedQuery);

    if (storeId) {
      primaryStoreRef = storeId;
    } else {
      const firstEntry = await SerializedInventory.findOne({ product: doc._id, status: "in_stock" }).sort({ createdAt: 1 }).select("store").lean();
      primaryStoreRef = firstEntry?.store ? firstEntry.store.toString() : null;
    }
  } else {
    const bulkQuery = storeId
      ? { store: toObjectId(storeId, "STORE_INVALID_ID"), product: doc._id }
      : { product: doc._id };
    const bulkRows = await BulkInventory.find(bulkQuery).lean();
    bulkRows.forEach((row) => {
      stockQuantity += Number(row.quantity || 0);
      minStockLevel = Number(row.minStockLevel || 0) || minStockLevel;
      if (!primaryStoreRef) primaryStoreRef = row.store.toString();
    });
  }

  if (stockQuantity === 0 && doc.inventoryMode !== "serialized") {
    const inventoryQuery = storeId
      ? { store: toObjectId(storeId, "STORE_INVALID_ID"), "items.product": doc._id }
      : { "items.product": doc._id };
    const inventories = await StoreInventory.find(inventoryQuery);
    inventories.forEach((inv) => {
      const item = inv.items.find((i) => i.product.toString() === doc._id.toString());
      if (item) {
        stockQuantity += item.quantity;
        minStockLevel = item.minStockLevel || minStockLevel;
        if (!primaryStoreRef) primaryStoreRef = inv.store.toString();
      }
    });
  }

  return {
    id: doc._id.toString(),
    job_id: doc.jobId || doc.jobNumber || "",
    product_code: doc.productCode || "",
    sku: doc.sku,
    barcode: doc.barcode || doc.sku,
    imei: doc.imei || "",
    serial_number: doc.serialNumber || "",
    name: doc.name,
    brand: doc.brand || "",
    model: doc.model || "",
    network_type: doc.networkType || "",
    category: dbCategoryToApi(doc.category),
    description: doc.deviceNotes || "",
    variant: doc.variant || "",
    ram: doc.ram || "",
    storage: doc.storage || "",
    color: doc.color || "",
    condition: doc.condition || "new",
    purchase_price: toMoney(doc.purchasePrice),
    price: toMoney(doc.unitPrice),
    selling_price: toMoney(doc.unitPrice),
    discount: toMoney(doc.discount),
    tax: toMoney(doc.taxRate),
    final_price: toMoney(Math.max(0, Number(doc.unitPrice || 0) - Number(doc.discount || 0))),
    stock_quantity: Number(stockQuantity),
    min_stock_level: Number(minStockLevel),
    primary_store_ref: primaryStoreRef,
    supplier_name: doc.supplierName || "",
    supplier_contact: doc.supplierContact || "",
    purchase_date: doc.purchaseDate ? doc.purchaseDate.toISOString().slice(0, 10) : "",
    images: doc.images || [],
    remarks: doc.remarks || "",
    device_notes: doc.deviceNotes || "",
    inventory_status: doc.inventoryStatus || "ready",
    inventory_mode: doc.inventoryMode || "bulk",
    active: Boolean(doc.isActive),
  };
}

async function requireStore(storeId) {
  const store = await Store.findOne({ _id: toObjectId(storeId, "STORE_INVALID_ID"), isActive: { $ne: false } });
  if (!store) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  }
  return store;
}

async function ensureUnique(field, value, code, message, excludeProductId) {
  const normalized = cleanText(value);
  if (!normalized) return;
  const query = { [field]: field === "sku" ? normalized.toLowerCase() : normalized };
  if (excludeProductId) query._id = { $ne: new mongoose.Types.ObjectId(excludeProductId) };
  const exists = await Product.exists(query);
  if (exists) throw new HttpError(409, message, code);
}

async function ensureIdentityUnique(input, excludeProductId) {
  await ensureUnique("sku", input.sku, "PRODUCT_DUPLICATE_SKU", "SKU already exists", excludeProductId);
  await ensureUnique("jobId", input.jobId, "PRODUCT_DUPLICATE_JOB_ID", "Job ID already exists", excludeProductId);
  await ensureUnique("productCode", input.productCode, "PRODUCT_DUPLICATE_PRODUCT_ID", "Product ID already exists", excludeProductId);
  await ensureUnique("barcode", input.barcode, "PRODUCT_DUPLICATE_BARCODE", "Barcode already exists", excludeProductId);
  await ensureUnique("imei", input.imei, "PRODUCT_DUPLICATE_IMEI", "IMEI already exists", excludeProductId);
  await ensureUnique("serialNumber", input.serialNumber, "PRODUCT_DUPLICATE_SERIAL", "Serial number already exists", excludeProductId);
}

async function upsertStoreInventory(session, storeId, productId, quantity, minStockLevel = 0) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new HttpError(400, "Stock quantity must be a non-negative integer", "PRODUCT_INVALID_STOCK_QUANTITY");
  }

  let inventory = await StoreInventory.findOne({ store: storeId }).session(session);
  if (!inventory) inventory = new StoreInventory({ store: storeId, items: [] });

  const itemIndex = inventory.items.findIndex((i) => i.product.toString() === productId.toString());
  if (itemIndex === -1) {
    inventory.items.push({
      product: productId,
      quantity,
      reservedQuantity: 0,
      minStockLevel: Math.max(0, Number(minStockLevel || 0)),
    });
  } else {
    inventory.items[itemIndex].quantity = quantity;
    inventory.items[itemIndex].reservedQuantity = Math.min(inventory.items[itemIndex].reservedQuantity, quantity);
    if (minStockLevel !== undefined) {
      inventory.items[itemIndex].minStockLevel = Math.max(0, Number(minStockLevel || 0));
    }
  }

  await inventory.save({ session });
}

async function upsertBulkInventory(session, storeId, productId, quantity, minStockLevel = 0, userId = null) {
  await BulkInventory.findOneAndUpdate(
    { store: storeId, product: productId },
    {
      $set: {
        quantity,
        minStockLevel: Math.max(0, Number(minStockLevel || 0)),
        addedBy: userId || undefined,
      },
    },
    { upsert: true, session, returnDocument: "after" },
  );
}

async function createSerializedEntries(session, product, storeId, entries, userId) {
  for (const entry of entries) {
    const imei = cleanText(entry.imei);
    const serialNumber = cleanText(entry.serial_number || entry.serialNumber);
    const barcode = cleanText(entry.barcode);
    if (!imei && !serialNumber && !barcode) {
      throw new HttpError(400, "Serialized entries require IMEI, serial number, or barcode", "PRODUCT_SERIALIZED_ENTRY_REQUIRED");
    }
    if (imei) {
      const imeiExists = await SerializedInventory.exists({ imei });
      if (imeiExists) throw new HttpError(409, "Duplicate IMEI detected", "PRODUCT_DUPLICATE_IMEI");
    }
    if (barcode) {
      const barcodeExists = await SerializedInventory.exists({ barcode });
      if (barcodeExists) throw new HttpError(409, "Duplicate barcode detected", "PRODUCT_DUPLICATE_BARCODE");
    }
    await SerializedInventory.create([{
      serialId: await nextSequence("serialized_inventory", "SER-", 6),
      product: product._id,
      imei,
      serialNumber,
      barcode,
      jobNumber: product.jobId || product.jobNumber || undefined,
      store: storeId,
      status: "in_stock",
      addedBy: userId,
    }], { session });
  }
}

export async function listProducts(input = {}) {
  if (input.storeId) {
    const storeObjectId = toObjectId(input.storeId, "STORE_INVALID_ID");
    const [bulkRows, serializedRows, inventory] = await Promise.all([
      BulkInventory.find({ store: storeObjectId, quantity: { $gt: 0 } }).lean(),
      SerializedInventory.find({ store: storeObjectId, status: "in_stock" }).select("product").lean(),
      StoreInventory.findOne({ store: storeObjectId }).lean(),
    ]);
    const ids = [
      ...bulkRows.map((item) => item.product),
      ...serializedRows.map((item) => item.product),
      ...((inventory?.items || []).filter((item) => Number(item.quantity || 0) > 0).map((item) => item.product)),
    ];
    if (ids.length === 0) return [];
    const products = await Product.find({ _id: { $in: ids }, isActive: true }).sort({ createdAt: -1 });
    const rows = [];
    for (const product of products) {
      rows.push(await mapProduct(product, input.storeId));
    }
    return rows;
  }

  const products = await Product.find().sort({ createdAt: -1 });
  const results = [];
  for (const p of products) results.push(await mapProduct(p));
  return results;
}

export async function createProduct(input) {
  const sku = String(input.sku || "").trim();
  const name = String(input.name || "").trim();
  const stockQuantity = Number(input.stockQuantity ?? 1);
  const primaryStoreRef = input.primaryStoreRef || null;
  const inventoryMode = resolveInventoryMode(input);
  const serializedEntries = Array.isArray(input.serializedEntries) ? input.serializedEntries : [];

  if (!sku) throw new HttpError(400, "SKU is required", "PRODUCT_REQUIRED_SKU");
  if (!name) throw new HttpError(400, "Product name is required", "PRODUCT_REQUIRED_NAME");
  if (Number(input.price) < 0 || Number(input.purchasePrice || 0) < 0) {
    throw new HttpError(400, "Price must be non-negative", "PRODUCT_INVALID_PRICE");
  }
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    throw new HttpError(400, "Stock quantity must be a non-negative integer", "PRODUCT_INVALID_STOCK_QUANTITY");
  }
  await ensureUnique("sku", sku, "PRODUCT_DUPLICATE_SKU", "SKU already exists");
  if (!primaryStoreRef) {
    throw new HttpError(400, "Store assignment is required", "PRODUCT_STORE_REQUIRED_FOR_STOCK");
  }
  if (inventoryMode === "serialized" && serializedEntries.length === 0 && stockQuantity > 0) {
    throw new HttpError(400, "Serialized products require unique device entries instead of manual quantity", "PRODUCT_SERIALIZED_ENTRIES_REQUIRED");
  }

  return withTransaction(async (session) => {
    const identity = await buildProductIdentity(input);
    const normalized = {
      ...input,
      ...identity,
      sku,
      serialNumber: cleanText(input.serialNumber),
    };
    await ensureIdentityUnique(normalized);

    const primaryStore = primaryStoreRef ? await requireStore(primaryStoreRef) : null;

    const [product] = await Product.create([{
      sku: sku.toLowerCase(),
      jobId: identity.jobId,
      productCode: identity.productCode,
      barcode: cleanText(input.barcode) || sku,
      imei: cleanText(input.imei),
      serialNumber: cleanText(input.serialNumber),
      name,
      brand: cleanText(input.brand),
      model: cleanText(input.model),
      networkType: input.networkType,
      variant: cleanText(input.variant),
      ram: cleanText(input.ram),
      storage: cleanText(input.storage),
      color: cleanText(input.color),
      condition: input.condition || (apiCategoryToDb(input.category) === "used_phone" ? "used" : "new"),
      category: apiCategoryToDb(input.category),
      purchasePrice: Number(toMoney(input.purchasePrice)),
      unitPrice: Number(toMoney(input.price)),
      discount: Number(toMoney(input.discount)),
      taxRate: Number(input.tax || 0),
      supplierName: cleanText(input.supplierName),
      supplierContact: cleanText(input.supplierContact),
      purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
      store: primaryStore?._id,
      storeName: primaryStore?.name,
      images: Array.isArray(input.images) ? input.images.filter(Boolean) : [],
      remarks: cleanText(input.remarks),
      deviceNotes: cleanText(input.deviceNotes || input.description),
      inventoryStatus: input.inventoryStatus || "ready",
      inventoryMode,
      isActive: input.active ?? true,
    }], { session });

    if (primaryStoreRef) {
      const storeObjectId = toObjectId(primaryStoreRef, "STORE_INVALID_ID");
      if (inventoryMode === "serialized") {
        await createSerializedEntries(session, product, storeObjectId, serializedEntries, input.userId);
      } else {
        await upsertBulkInventory(
          session,
          storeObjectId,
          product._id,
          stockQuantity,
          Number(input.minStockLevel || 0),
          input.userId,
        );
        await upsertStoreInventory(
          session,
          storeObjectId,
          product._id,
          stockQuantity,
          Number(input.minStockLevel || 0),
        );
      }

      const openingQuantity = inventoryMode === "serialized" ? serializedEntries.length : stockQuantity;
      if (openingQuantity > 0) {
        await StockLedger.create([{
          store: storeObjectId,
          product: product._id,
          movementType: "in",
          quantity: openingQuantity,
          referenceType: "product_create",
          referenceId: product._id,
          note: "Initial stock",
          createdBy: input.userId,
        }], { session });
      }
    }

    return mapProduct(product, primaryStoreRef);
  });
}

export async function updateProduct(productId, input) {
  return withTransaction(async (session) => {
    const product = await Product.findById(toObjectId(productId, "PRODUCT_INVALID_ID")).session(session);
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");

    const identityPayload = {
      sku: input.sku !== undefined ? input.sku : product.sku,
      jobId: input.jobId !== undefined ? input.jobId : product.jobId,
      productCode: input.productCode !== undefined ? input.productCode : product.productCode,
      barcode: input.barcode !== undefined ? input.barcode : product.barcode,
      imei: input.imei !== undefined ? input.imei : product.imei,
      serialNumber: input.serialNumber !== undefined ? input.serialNumber : product.serialNumber,
    };
    await ensureIdentityUnique(identityPayload, product._id);

    if (input.sku !== undefined) product.sku = String(input.sku).trim().toLowerCase();
    if (input.jobId !== undefined) product.jobId = cleanText(input.jobId);
    if (input.productCode !== undefined) product.productCode = cleanText(input.productCode);
    if (input.barcode !== undefined) product.barcode = cleanText(input.barcode);
    if (input.imei !== undefined) product.imei = cleanText(input.imei);
    if (input.serialNumber !== undefined) product.serialNumber = cleanText(input.serialNumber);
    if (input.name !== undefined) product.name = String(input.name).trim();
    if (input.category !== undefined) product.category = apiCategoryToDb(input.category);
    if (input.price !== undefined) product.unitPrice = Number(toMoney(input.price));
    if (input.purchasePrice !== undefined) product.purchasePrice = Number(toMoney(input.purchasePrice));
    if (input.discount !== undefined) product.discount = Number(toMoney(input.discount));
    if (input.tax !== undefined) product.taxRate = Number(input.tax || 0);
    if (input.brand !== undefined) product.brand = cleanText(input.brand);
    if (input.model !== undefined) product.model = cleanText(input.model);
    if (input.networkType !== undefined) product.networkType = input.networkType;
    if (input.variant !== undefined) product.variant = cleanText(input.variant);
    if (input.ram !== undefined) product.ram = cleanText(input.ram);
    if (input.storage !== undefined) product.storage = cleanText(input.storage);
    if (input.color !== undefined) product.color = cleanText(input.color);
    if (input.condition !== undefined) product.condition = input.condition;
    if (input.supplierName !== undefined) product.supplierName = cleanText(input.supplierName);
    if (input.supplierContact !== undefined) product.supplierContact = cleanText(input.supplierContact);
    if (input.purchaseDate !== undefined) product.purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : undefined;
    if (input.images !== undefined) product.images = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
    if (input.remarks !== undefined) product.remarks = cleanText(input.remarks);
    if (input.deviceNotes !== undefined || input.description !== undefined) product.deviceNotes = cleanText(input.deviceNotes || input.description);
    if (input.inventoryStatus !== undefined) product.inventoryStatus = input.inventoryStatus;
    if (input.active !== undefined) product.isActive = input.active;
    if (input.inventoryMode !== undefined) product.inventoryMode = input.inventoryMode;
    if (input.primaryStoreRef !== undefined && input.primaryStoreRef) {
      const targetStoreDoc = await requireStore(input.primaryStoreRef);
      product.store = targetStoreDoc._id;
      product.storeName = targetStoreDoc.name;
    }

    await product.save({ session });

    const hasInventoryUpdate = input.stockQuantity !== undefined
      || input.primaryStoreRef !== undefined
      || input.minStockLevel !== undefined
      || input.inventoryStatus !== undefined;
    let targetStore = input.primaryStoreRef;
    if (!targetStore) {
      const inv = await StoreInventory.findOne({ "items.product": product._id }).session(session);
      if (inv) targetStore = inv.store.toString();
    }

    if (hasInventoryUpdate) {
      if (!targetStore) {
        throw new HttpError(400, "Primary store is required to set stock quantity", "PRODUCT_STORE_REQUIRED_FOR_STOCK");
      }
      await requireStore(targetStore);

      if (input.stockQuantity !== undefined || input.inventoryStatus !== undefined) {
        const nextQuantity = input.stockQuantity !== undefined
          ? Number(input.stockQuantity)
          : input.inventoryStatus === "sold" ? 0 : 1;
        await upsertBulkInventory(
          session,
          toObjectId(targetStore, "STORE_INVALID_ID"),
          product._id,
          nextQuantity,
          Number(input.minStockLevel || 0),
          input.userId,
        );
        await upsertStoreInventory(
          session,
          toObjectId(targetStore, "STORE_INVALID_ID"),
          product._id,
          nextQuantity,
          Number(input.minStockLevel || 0),
        );
      }
    }

    return mapProduct(product, targetStore);
  });
}

export async function deleteProduct(productId) {
  await withTransaction(async (session) => {
    const product = await Product.findById(toObjectId(productId, "PRODUCT_INVALID_ID")).session(session);
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");

    const saleExists = await Sale.exists({ "items.product": product._id }).session(session);
    if (saleExists) {
      throw new HttpError(409, "Cannot delete product because it has been used in sales", "PRODUCT_USED_IN_SALES");
    }

    product.isActive = false;
    await product.save({ session });
  });
}
