import { z } from "zod";
import { hashPassword } from "../../utils/password.js";
import { HttpError } from "../../utils/httpError.js";
import {
  listManagedStores,
  resetCredentialPassword,
} from "./employeeAccess.service.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");
const employeeIdParamSchema = z.object({ employeeId: objectIdSchema });
const resetPasswordSchema = z.object({
  password: z.string().min(8).max(200),
});

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
