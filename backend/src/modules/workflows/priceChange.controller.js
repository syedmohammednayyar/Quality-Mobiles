import * as priceChangeService from "./priceChange.service.js";

export async function requestPriceChangeHandler(req, res, next) {
  try {
    const { productId, newPrice, reason, effectiveDate } = req.body;

    const result = await priceChangeService.requestPriceChange({
      productId,
      newPrice,
      reason,
      effectiveDate,
      userId: req.auth.id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function listPendingPriceChangesHandler(req, res, next) {
  try {
    const result = await priceChangeService.listPendingPriceChanges();

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function approvePriceChangeHandler(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);

    const result = await priceChangeService.approvePriceChange(id, req.auth.id);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function rejectPriceChangeHandler(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const { rejectionReason } = req.body;

    const result = await priceChangeService.rejectPriceChange(
      id,
      rejectionReason,
      req.auth.id,
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
