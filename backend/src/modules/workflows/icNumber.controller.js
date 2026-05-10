import * as icNumberService from "./icNumber.service.js";

export async function captureIcNumberHandler(req, res, next) {
  try {
    const { entityType, entityId, icNumber } = req.body;

    const result = await icNumberService.captureIcNumber({
      entityType,
      entityId,
      icNumber,
      userId: req.auth.id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function requestIcNumberChangeHandler(req, res, next) {
  try {
    const { entityType, entityId, newIcNumber, reason } = req.body;

    const result = await icNumberService.requestIcNumberChange({
      entityType,
      entityId,
      newIcNumber,
      reason,
      userId: req.auth.id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function checkIcNumberLockedHandler(req, res, next) {
  try {
    const { entityType, entityId } = req.params;
    const isLocked = await icNumberService.isIcNumberLocked(
      entityType,
      parseInt(entityId, 10),
    );

    res.json({ success: true, data: { isLocked } });
  } catch (error) {
    next(error);
  }
}
