import { HttpError } from "./httpError.js";
import { assertObjectId } from "./ids.js";

export function isAdmin(auth) {
  return Boolean(auth?.roles?.includes("admin"));
}

export function assertStoreAccess(auth, storeId) {
  const normalizedStoreId = assertObjectId(storeId, "STORE_INVALID_ID");
  if (isAdmin(auth)) return normalizedStoreId;

  const assignedStoreId = auth?.store_id ? String(auth.store_id) : null;
  if (!assignedStoreId) {
    throw new HttpError(
      403,
      "Forbidden: no store assigned to this user",
      "STORE_ASSIGNMENT_REQUIRED",
    );
  }
  if (!assignedStoreId || assignedStoreId !== normalizedStoreId) {
    throw new HttpError(
      403,
      "Forbidden: store access denied",
      "STORE_ACCESS_DENIED",
    );
  }

  return normalizedStoreId;
}
