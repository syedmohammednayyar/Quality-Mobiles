import { withTransaction } from "../../db/mongodb.js";
import { Product, Store, StoreInventory, GiftTransaction, StockLedger } from "../../db/models.js";
import { HttpError } from "../../utils/httpError.js";

/**
 * Issue gift from inventory
 * Reduces store_inventory quantity and creates gift_transaction record
 */
export async function issueGift(input) {
  if (input.quantity <= 0) {
    throw new HttpError(
      400,
      "Quantity must be greater than 0",
      "INVALID_QUANTITY",
    );
  }

  return await withTransaction(async (session) => {
    // Verify product exists and is marked as gift
    const product = await Product.findOne({ _id: input.productId, isActive: true }).session(session);

    if (!product) {
      throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    if (!product.isGift) {
      throw new HttpError(
        400,
        "Product is not marked as gift",
        "NOT_A_GIFT_PRODUCT",
      );
    }

    // Verify store exists
    const store = await Store.findOne({ _id: input.storeId, isActive: true }).session(session);

    if (!store) {
      throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
    }

    // Check inventory availability
    const inventory = await StoreInventory.findOne({ store: input.storeId }).session(session);

    if (!inventory) {
      throw new HttpError(400, "Insufficient gift inventory", "INSUFFICIENT_INVENTORY");
    }

    const itemIndex = inventory.items.findIndex(item => item.product.equals(input.productId));
    if (itemIndex === -1 || inventory.items[itemIndex].quantity < input.quantity) {
      throw new HttpError(
        400,
        "Insufficient gift inventory",
        "INSUFFICIENT_INVENTORY",
      );
    }

    // Reduce inventory
    inventory.items[itemIndex].quantity -= input.quantity;
    await inventory.save({ session });

    // Create gift transaction
    const [giftTransaction] = await GiftTransaction.create([{
      product: input.productId,
      store: input.storeId,
      quantity: input.quantity,
      transactionType: 'issue',
      referenceType: input.referenceType || null,
      referenceId: input.referenceId || null,
      assignedTo: input.assignedTo,
      notes: input.notes || null,
      createdBy: input.userId
    }], { session });

    // Create stock ledger entry
    await StockLedger.create([{
      store: input.storeId,
      product: input.productId,
      movementType: 'out',
      quantity: input.quantity,
      reason: `Gift issued to ${input.assignedTo}`,
      createdBy: input.userId,
      referenceType: 'GiftTransaction',
      referenceId: giftTransaction._id
    }], { session });

    return {
      id: giftTransaction._id,
      product_id: giftTransaction.product,
      store_id: giftTransaction.store,
      quantity: giftTransaction.quantity,
      transaction_type: giftTransaction.transactionType,
      reference_type: giftTransaction.referenceType,
      reference_id: giftTransaction.referenceId,
      assigned_to: giftTransaction.assignedTo,
      notes: giftTransaction.notes,
      created_by: giftTransaction.createdBy,
      created_at: giftTransaction.createdAt
    };
  });
}

/**
 * Receive gift back into inventory
 * Increases store_inventory quantity and creates reverse gift_transaction
 */
export async function receiveGift(input) {
  if (input.quantity <= 0) {
    throw new HttpError(
      400,
      "Quantity must be greater than 0",
      "INVALID_QUANTITY",
    );
  }

  return await withTransaction(async (session) => {
    // Get original gift transaction
    const originalGift = await GiftTransaction.findOne({ 
      _id: input.giftTransactionId, 
      transactionType: 'issue' 
    }).session(session);

    if (!originalGift) {
      throw new HttpError(
        404,
        "Gift transaction not found",
        "GIFT_TRANSACTION_NOT_FOUND",
      );
    }

    if (input.quantity > originalGift.quantity) {
      throw new HttpError(
        400,
        "Cannot receive more than originally issued",
        "INVALID_QUANTITY",
      );
    }

    // Increase inventory
    const inventory = await StoreInventory.findOne({ store: originalGift.store }).session(session);
    if (!inventory) {
      throw new HttpError(500, "Inventory record not found", "INVENTORY_NOT_FOUND");
    }

    let itemIndex = inventory.items.findIndex(item => item.product.equals(originalGift.product));
    if (itemIndex === -1) {
      inventory.items.push({
        product: originalGift.product,
        quantity: input.quantity
      });
    } else {
      inventory.items[itemIndex].quantity += input.quantity;
    }
    await inventory.save({ session });

    // Create reverse gift transaction
    const [receiveTransaction] = await GiftTransaction.create([{
      product: originalGift.product,
      store: originalGift.store,
      quantity: input.quantity,
      transactionType: 'receive',
      referenceType: 'GiftTransaction',
      referenceId: originalGift._id,
      notes: input.notes || null,
      createdBy: input.userId
    }], { session });

    // Create stock ledger entry
    await StockLedger.create([{
      store: originalGift.store,
      product: originalGift.product,
      movementType: 'in',
      quantity: input.quantity,
      reason: 'Gift received back',
      createdBy: input.userId,
      referenceType: 'GiftTransaction',
      referenceId: receiveTransaction._id
    }], { session });

    return {
      id: receiveTransaction._id,
      product_id: receiveTransaction.product,
      store_id: receiveTransaction.store,
      quantity: receiveTransaction.quantity,
      transaction_type: receiveTransaction.transactionType,
      reference_type: receiveTransaction.referenceType,
      reference_id: receiveTransaction.referenceId,
      assigned_to: receiveTransaction.assignedTo,
      notes: receiveTransaction.notes,
      created_by: receiveTransaction.createdBy,
      created_at: receiveTransaction.createdAt
    };
  });
}

/**
 * List gift inventory for a store
 */
export async function listGiftInventory(storeId) {
  const inventory = await StoreInventory.findOne({ store: storeId })
    .populate({
      path: 'items.product',
      match: { isGift: true, isActive: true }
    })
    .lean();

  if (!inventory) return [];

  return inventory.items
    .filter(item => item.product) // Only keep those that matched the populate criteria
    .map(item => ({
      product_id: item.product._id,
      store_id: storeId,
      quantity: item.quantity,
      reserved_quantity: item.reservedQuantity,
      product_name: item.product.name,
      sku: item.product.sku
    }))
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

/**
 * Get gift transaction history
 */
export async function getGiftTransactionHistory(storeId, productId) {
  const filter = { store: storeId };
  if (productId) {
    filter.product = productId;
  }

  const transactions = await GiftTransaction.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  return transactions.map(t => ({
    id: t._id,
    product_id: t.product,
    store_id: t.store,
    quantity: t.quantity,
    transaction_type: t.transactionType,
    reference_type: t.referenceType,
    reference_id: t.referenceId,
    assigned_to: t.assignedTo,
    notes: t.notes,
    created_by: t.createdBy,
    created_at: t.createdAt
  }));
}

/**
 * Create gift product
 */
export async function createGiftProduct(input) {
  return await withTransaction(async (session) => {
    // Check if SKU already exists
    const existingProduct = await Product.findOne({ 
      sku: { $regex: new RegExp(`^${input.sku}$`, 'i') } 
    }).session(session);

    if (existingProduct) {
      throw new HttpError(409, "SKU already exists", "SKU_DUPLICATE");
    }

    const [product] = await Product.create([{
      sku: input.sku,
      name: input.name,
      category: 'service',
      unitPrice: input.unitPrice,
      taxRate: input.taxRate || 0,
      isGift: true,
      giftCategory: input.giftCategory,
      isActive: true
    }], { session });

    return {
      id: product._id,
      sku: product.sku,
      name: product.name,
      is_gift: product.isGift,
      gift_category: product.giftCategory
    };
  });
}
