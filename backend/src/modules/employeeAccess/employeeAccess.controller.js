import { z } from "zod";
import { hashPassword } from "../../utils/password.js";
import { HttpError } from "../../utils/httpError.js";
import {
  listCredentialAccounts,
  listManagedStores,
  resetCredentialPassword,
  updateCredentialStatus,
} from "./employeeAccess.service.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");
const credentialListQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "suspended", "deactivated", "locked"]).optional(),
  approval_status: z.enum(["pending", "approved", "rejected"]).optional(),
});
const employeeIdParamSchema = z.object({ employeeId: objectIdSchema });
const updateStatusSchema = z.object({
  status: z.enum(["approved", "suspended", "deactivated", "locked"]),
});
const resetPasswordSchema = z.object({
  password: z.string().min(8).max(200),
});

export async function listCredentialsHandler(req, res, next) {
  try {
    const query = credentialListQuerySchema.parse(req.query);
    const rows = await listCredentialAccounts(req.auth, {
      status: query.status,
      approvalStatus: query.approval_status,
    });
    res.status(200).json({ rows });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, error.issues[0]?.message || "Invalid request", "VALIDATION_ERROR"));
      return;
    }
    next(error);
  }
}

export async function updateCredentialStatusHandler(req, res, next) {
  try {
    const { employeeId } = employeeIdParamSchema.parse(req.params);
    const payload = updateStatusSchema.parse(req.body);
    const row = await updateCredentialStatus(req.auth, employeeId, payload.status);
    res.status(200).json(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, error.issues[0]?.message || "Invalid request", "VALIDATION_ERROR"));
      return;
    }
    next(error);
  }
}

export async function resetCredentialPasswordHandler(req, res, next) {
  try {
    const { employeeId } = employeeIdParamSchema.parse(req.params);
    const payload = resetPasswordSchema.parse(req.body);
    const passwordHash = await hashPassword(payload.password);
    const result = await resetCredentialPassword(req.auth, employeeId, passwordHash);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, error.issues[0]?.message || "Invalid request", "VALIDATION_ERROR"));
      return;
    }
    next(error);
  }
}

export async function listManagedStoresHandler(req, res, next) {
  try {
    const rows = await listManagedStores(req.auth);
    res.status(200).json({ rows });
  } catch (error) {
    next(error);
  }
}
