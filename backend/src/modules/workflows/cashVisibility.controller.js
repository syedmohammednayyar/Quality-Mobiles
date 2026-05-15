import * as cashVisibilityService from "./cashVisibility.service.js";

export async function checkCashVisibilityHandler(req, res, next) {
  try {
    const { transactionDate, storeId, overrideT1 } = req.body;

    const result = await cashVisibilityService.checkCashVisibility(
      {
        userId: req.auth.id,
        userRoles: req.auth.roles,
        storeId,
      },
      new Date(transactionDate),
    );

    if (overrideT1 && result.overrideAllowed) {
      await cashVisibilityService.logT1Override(req.auth.id, storeId, {
        fromDate: transactionDate,
        toDate: transactionDate,
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function validateT1AccessHandler(req, res, next) {
  try {
    const { date, overrideT1 } = req.query;

    if (!date || typeof date !== "string") {
      res.status(400).json({
        success: false,
        error: "Date query parameter is required",
      });
      return;
    }

    const result = cashVisibilityService.validateT1Access(
      req.auth.roles,
      new Date(date),
      overrideT1 === "true",
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
