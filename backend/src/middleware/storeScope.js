import mongoose from "mongoose";
import { Employee, EmployeeStoreAssignment, Store } from "../db/models.js";
import { HttpError } from "../utils/httpError.js";

const FIXED_STORE_CODES = ["STORE1", "STORE2", "STORE3", "STORE4"];

function getRequestedStoreId(req) {
  return (
    req.headers["x-store-id"] ||
    req.query.storeId ||
    req.body?.storeId ||
    req.body?.storeRef ||
    req.params?.storeId ||
    null
  );
}

export async function resolveStoreContext(req, _res, next) {
  try {
    if (!req.auth) return next();

    const requested = getRequestedStoreId(req);
    if (!requested) return next();

    const store = await Store.findOne({ _id: requested, isActive: true });
    if (!store || !FIXED_STORE_CODES.includes(store.code)) {
      throw new HttpError(403, "Invalid or unauthorized store context", "STORE_SCOPE_INVALID");
    }

    const isAdmin = req.auth.roles.includes("admin");
    if (!isAdmin) {
      const employee = await Employee.findOne({ user: req.auth.userId, isActive: true });
      if (!employee) throw new HttpError(403, "Employee profile not found", "EMPLOYEE_NOT_FOUND");

      const assignment = await EmployeeStoreAssignment.findOne({
        employee: employee._id,
        store: store._id,
        status: "active",
      });

      if (!assignment) {
        throw new HttpError(403, "Store access denied", "STORE_ACCESS_DENIED");
      }
    }

    req.auth.store_id = String(store._id);
    req.storeScope = { storeId: String(store._id), storeCode: store.code };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireStoreScope(req, _res, next) {
  if (!req.auth?.store_id) {
    next(new HttpError(400, "Store context is required", "STORE_CONTEXT_REQUIRED"));
    return;
  }
  next();
}

export function applyStoreFilter(req, _res, next) {
  const storeId = req.auth?.store_id;
  if (storeId && mongoose.Types.ObjectId.isValid(storeId)) {
    req.storeFilter = { store: storeId };
  } else {
    req.storeFilter = {};
  }
  next();
}
