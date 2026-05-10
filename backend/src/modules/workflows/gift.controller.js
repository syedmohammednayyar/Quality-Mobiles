import * as giftService from "./gift.service.js";

export async function createGiftProductHandler(req, res, next) {
  try {
    const { sku, name, giftCategory, unitPrice, taxRate } = req.body;

    const result = await giftService.createGiftProduct({
      sku,
      name,
      giftCategory,
      unitPrice,
      taxRate,
      userId: req.auth.id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function issueGiftHandler(req, res, next) {
  try {
    const {
      productId,
      storeId,
      quantity,
      assignedTo,
      referenceType,
      referenceId,
      notes,
    } = req.body;

    const result = await giftService.issueGift({
      productId,
      storeId,
      quantity,
      assignedTo,
      referenceType,
      referenceId,
      notes,
      userId: req.auth.id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function receiveGiftHandler(req, res, next) {
  try {
    const { giftTransactionId, quantity, notes } = req.body;

    const result = await giftService.receiveGift({
      giftTransactionId,
      quantity,
      notes,
      userId: req.auth.id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function listGiftInventoryHandler(req, res, next) {
  try {
    const storeId = parseInt(req.params.storeId, 10);

    const result = await giftService.listGiftInventory(storeId);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getGiftTransactionHistoryHandler(req, res, next) {
  try {
    const storeId = parseInt(req.params.storeId, 10);
    const productId = req.query.productId
      ? parseInt(req.query.productId, 10)
      : undefined;

    const result = await giftService.getGiftTransactionHistory(
      storeId,
      productId,
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
