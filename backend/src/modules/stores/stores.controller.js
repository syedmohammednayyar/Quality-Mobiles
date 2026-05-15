import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import {
  listStores,
  updateStore,
} from "./stores.service.js";
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

const updateStoreSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  code: z.string().min(1).max(30).optional(),
  store_type: z.enum(["main", "addon"]).optional(),
  parent: objectIdSchema.nullable().optional(),
  is_active: z.boolean().optional(),
});

const storeIdParamsSchema = z.object({
  storeId: objectIdSchema,
});

export async function listStoresHandler(req, res, next) {
  try {
    const isAdmin = req.auth?.roles?.includes("admin");
    const storeId = isAdmin ? undefined : req.auth?.store_id;

    const rows = await listStores(storeId || undefined);
    res.status(200).json({ rows });
  } catch (error) {
    next(error);
  }
}

export async function updateStoreHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const params = storeIdParamsSchema.parse(req.params);
    const payload = updateStoreSchema.parse(req.body);

    const row = await updateStore(params.storeId, {
      name: payload.name,
      code: payload.code,
      storeType: payload.store_type,
      parent: payload.parent,
      isActive: payload.is_active,
      actorRoles: req.auth.roles,
    });

    res.status(200).json(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(
        new HttpError(
          400,
          error.issues[0]?.message || "Invalid request",
          "VALIDATION_ERROR",
        ),
      );
      return;
    }
    next(error);
  }
}
