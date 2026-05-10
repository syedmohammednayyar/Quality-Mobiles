import { GiftTransaction, Store, Product, StoreInventory, StockLedger, User } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";

export async function createGiftTransaction(input) {
  if (input.quantity <= 0) {
    throw new HttpError(400, "Quantity must be positive", "INVALID_QUANTITY");
  }

  return withTransaction(async (session) => {
    // Validate store
    const store = await Store.findOne({ _id: input.storeId, isActive: true }).session(session);
    if (!store) {
      throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
    }

    // Validate product
    const product = await Product.findOne({ _id: input.productId, isActive: true }).session(session);
    if (!product) {
      throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    const productName = product.name;

    // For 'issue' type, check and reduce inventory
    if (input.transactionType === "issue") {
      const inventory = await StoreInventory.findOne({ 
        store: input.storeId, 
        "items.product": input.productId 
      }).session(session);

      const item = inventory ? inventory.items.find(i => i.product.toString() === input.productId.toString()) : null;
      const currentQuantity = item ? item.quantity : 0;
      
      if (currentQuantity < input.quantity) {
        throw new HttpError(
          400,
          `Insufficient stock. Available: ${currentQuantity}`,
          "INSUFFICIENT_STOCK",
        );
      }

      // Reduce inventory
      await StoreInventory.findOneAndUpdate(
        { store: input.storeId, "items.product": input.productId },
        { 
          $inc: { "items.$.quantity": -input.quantity },
          $set: { updatedAt: new Date() }
        },
        { session }
      );

      // Record in stock ledger
      await StockLedger.create([{
        store: input.storeId,
        product: input.productId,
        movementType: 'out',
        quantity: input.quantity,
        referenceType: 'gift_transaction',
        referenceId: null, // Placeholder as we don't have gt id yet, or we can use a temporary id
        note: `Gift issued to: ${input.assignedTo || "N/A"}`,
        createdBy: input.userId,
      }], { session });
    }

    // For 'receive' type, add to inventory
    if (input.transactionType === "receive") {
      const inventory = await StoreInventory.findOne({ store: input.storeId }).session(session);
      const itemExists = inventory && inventory.items.some(i => i.product.toString() === input.productId.toString());

      if (itemExists) {
        await StoreInventory.findOneAndUpdate(
          { store: input.storeId, "items.product": input.productId },
          { 
            $inc: { "items.$.quantity": input.quantity },
            $set: { updatedAt: new Date() }
          },
          { session }
        );
      } else {
        await StoreInventory.findOneAndUpdate(
          { store: input.storeId },
          { 
            $push: { 
              items: { 
                product: input.productId, 
                quantity: input.quantity, 
                reservedQuantity: 0, 
                minStockLevel: 0 
              } 
            } 
          },
          { upsert: true, session }
        );
      }

      // Record in stock ledger
      await StockLedger.create([{
        store: input.storeId,
        product: input.productId,
        movementType: 'in',
        quantity: input.quantity,
        referenceType: 'gift_transaction',
        referenceId: null,
        note: "Gift received",
        createdBy: input.userId,
      }], { session });
    }

    // Insert gift transaction record
    const [gt] = await GiftTransaction.create([{
      product: input.productId,
      store: input.storeId,
      quantity: input.quantity,
      transactionType: input.transactionType,
      referenceType: input.referenceType || null,
      referenceId: input.referenceId || null,
      assignedTo: input.assignedTo || null,
      notes: input.notes || null,
      createdBy: input.userId,
    }], { session });

    // Update stock ledger referenceId
    await StockLedger.updateMany(
      { referenceType: 'gift_transaction', referenceId: null, createdBy: input.userId },
      { $set: { referenceId: gt._id } },
      { session }
    );

    const result = gt.toObject();
    result.product_name = productName;
    return result;
  });
}

export async function listGiftTransactions(filters, userStoreId, userRoles) {
  const query = {};

  if (filters.storeId) query.store = filters.storeId;
  if (filters.productId) query.product = filters.productId;
  if (filters.transactionType) query.transactionType = filters.transactionType;
  
  if (filters.fromDate || filters.toDate) {
    query.createdAt = {};
    if (filters.fromDate) query.createdAt.$gte = new Date(filters.fromDate);
    if (filters.toDate) query.createdAt.$lte = new Date(filters.toDate);
  }

  if (userRoles && !userRoles.includes("admin") && userStoreId) {
    query.store = userStoreId;
  }

  const transactions = await GiftTransaction.find(query)
    .populate('product', 'name')
    .populate('store', 'name')
    .populate('createdBy', 'username')
    .sort({ createdAt: -1 });

  return transactions.map(t => {
    const obj = t.toObject();
    obj.product_name = t.product ? t.product.name : null;
    obj.store_name = t.store ? t.store.name : null;
    obj.created_by_name = t.createdBy ? t.createdBy.username : null;
    return obj;
  });
}

export async function getGiftTransactionById(id) {
  const t = await GiftTransaction.findById(id)
    .populate('product', 'name')
    .populate('store', 'name')
    .populate('createdBy', 'username');

  if (!t) return null;

  const obj = t.toObject();
  obj.product_name = t.product ? t.product.name : null;
  obj.store_name = t.store ? t.store.name : null;
  obj.created_by_name = t.createdBy ? t.createdBy.username : null;
  return obj;
}

export async function getGiftInventorySummary(storeId) {
  const query = {};
  if (storeId) query.store = storeId;

  const transactions = await GiftTransaction.find(query).populate('product', 'name');

  const summaryMap = new Map();

  transactions.forEach(t => {
    const productId = t.product._id.toString();
    if (!summaryMap.has(productId)) {
      summaryMap.set(productId, {
        productId,
        productName: t.product.name,
        totalReceived: 0,
        totalIssued: 0
      });
    }

    const entry = summaryMap.get(productId);
    if (t.transactionType === 'receive') {
      entry.totalReceived += t.quantity;
    } else {
      entry.totalIssued += t.quantity;
    }
  });

  return Array.from(summaryMap.values()).map(entry => ({
    ...entry,
    netQuantity: entry.totalReceived - entry.totalIssued
  })).sort((a, b) => a.productName.localeCompare(b.productName));
}
