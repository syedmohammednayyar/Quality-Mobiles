import { HttpError } from "../../utils/httpError.js";
import {
  createChangeRequest,
  listChangeRequests,
  getChangeRequestById,
  approveChangeRequest,
  rejectChangeRequest,
  getPendingCount,
} from "./changeRequests.service.js";

export async function createChangeRequestHandler(req, res, next) {
  try {
    const { entityType, entityId, fieldName, oldValue, newValue, reason } =
      req.body;

    if (
      !entityType ||
      !entityId ||
      !fieldName ||
      oldValue === undefined ||
      newValue === undefined
    ) {
      throw new HttpError(400, "Missing required fields", "VALIDATION_ERROR");
    }

    const input = {
      entityType,
      entityId: Number(entityId),
      fieldName,
      oldValue: String(oldValue),
      newValue: String(newValue),
      reason,
      userId: req.auth.userId,
    };

    const result = await createChangeRequest(input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listChangeRequestsHandler(req, res, next) {
  try {
    const { status, entityType, requestedBy, fromDate, toDate } = req.query;

    const filters = {
      status: status,
      entityType: entityType,
      requestedBy: requestedBy ? Number(requestedBy) : undefined,
      fromDate: fromDate,
      toDate: toDate,
    };

    const result = await listChangeRequests(
      filters,
      req.auth.userId,
      req.auth.roles,
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getChangeRequestByIdHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      throw new HttpError(400, "Invalid change request ID", "VALIDATION_ERROR");
    }

    const result = await getChangeRequestById(id);
    if (!result) {
      throw new HttpError(404, "Change request not found", "NOT_FOUND");
    }

    // Non-admins can only view their own requests
    if (
      !req.auth.roles.includes("admin") &&
      result.requested_by !== String(req.auth.userId)
    ) {
      throw new HttpError(
        403,
        "You can only view your own requests",
        "FORBIDDEN",
      );
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function approveChangeRequestHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      throw new HttpError(400, "Invalid change request ID", "VALIDATION_ERROR");
    }

    const result = await approveChangeRequest(
      id,
      req.auth.userId,
      req.auth.roles,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function rejectChangeRequestHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      throw new HttpError(400, "Invalid change request ID", "VALIDATION_ERROR");
    }

    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      throw new HttpError(
        400,
        "Rejection reason is required",
        "VALIDATION_ERROR",
      );
    }

    const result = await rejectChangeRequest(
      id,
      req.auth.userId,
      rejectionReason,
      req.auth.roles,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getPendingCountHandler(req, res, next) {
  try {
    const count = await getPendingCount();
    res.json({ count });
  } catch (error) {
    next(error);
  }
}
