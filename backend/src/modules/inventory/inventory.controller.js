import { z } from "zod";
import { createChangeRequest } from "../changeRequests/changeRequests.service.js";
import { HttpError } from "../../utils/httpError.js";
import { assertStoreAccess, isAdmin } from "../../utils/storeAccess.js";
import {
  adjustInventory,
  listActiveStores,
  listLowStock,
  listStoreInventory,
  transferStock,
} from "./inventory.service.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

const storeParamsSchema = z.object({
  storeId: objectIdSchema,
});

const adjustParamsSchema = z.object({
  storeId: objectIdSchema,
  productId: objectIdSchema,
});

const adjustBodySchema = z.object({
  delta: z.number().int().refine((value) => value !== 0, "Delta cannot be zero"),
  reason: z.string().min(3).max(500),
  min_stock_level: z.coerce.number().int().min(0).optional(),
});

const inventoryQuerySchema = z.object({
  store_id: objectIdSchema.optional(),
  search: z.string().max(120).optional(),
  category: z.enum(["new_phone", "used_phone", "accessory", "service", "repair_part"]).optional(),
  stock_status: z.enum(["in_stock", "low_stock", "out_of_stock"]).optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const transferBodySchema = z.object({
  from_store_id: objectIdSchema,
  to_store_id: objectIdSchema,
  product_id: objectIdSchema,
  quantity: z.coerce.number().int().positive(),
  reason: z.string().min(3).max(500),
});

function handleZod(error, next) {
  if (error instanceof z.ZodError) {
    next(new HttpError(400, error.issues[0]?.message || "Invalid request", "VALIDATION_ERROR"));
    return true;
  }
  return false;
}

export async function listStoresHandler(_req, res, next) {
  try {
    const rows = await listActiveStores();
    res.status(200).json({ rows });
  } catch (error) {
    next(error);
  }
}

export async function listInventoryByQueryHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const query = inventoryQuerySchema.parse(req.query);

    if (!query.store_id) {
      return res.status(200).json({ rows: [], total: 0, limit: query.limit || 100, offset: query.offset || 0 });
    }

    assertStoreAccess(req.auth, query.store_id);

    const result = await listStoreInventory(query.store_id, {
      search: query.search,
      category: query.category,
      stockStatus: query.stock_status,
      limit: query.limit,
      offset: query.offset,
    });
    res.status(200).json(result);
  } catch (error) {
    if (handleZod(error, next)) return;
    next(error);
  }
}

export async function listInventoryHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const params = storeParamsSchema.parse(req.params);
    assertStoreAccess(req.auth, params.storeId);
    const result = await listStoreInventory(params.storeId);
    res.status(200).json(result);
  } catch (error) {
    if (handleZod(error, next)) return;
    next(error);
  }
}

export async function listLowStockHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const params = storeParamsSchema.parse(req.params);
    assertStoreAccess(req.auth, params.storeId);
    const rows = await listLowStock(params.storeId);
    res.status(200).json({ rows });
  } catch (error) {
    if (handleZod(error, next)) return;
    next(error);
  }
}

export async function adjustInventoryHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");

    const params = adjustParamsSchema.parse(req.params);
    const body = adjustBodySchema.parse(req.body);
    assertStoreAccess(req.auth, params.storeId);

    if (isAdmin(req.auth)) {
      const result = await adjustInventory({
        storeId: params.storeId,
        productId: params.productId,
        delta: body.delta,
        reason: body.reason,
        minStockLevel: body.min_stock_level,
        userId: req.auth.userId,
      });

      res.status(200).json(result);
      return;
    }

    const result = await listStoreInventory(params.storeId, { limit: 500 });
    const row = result.rows.find((r) => r.product_id === params.productId);
    const currentQty = row ? Number(row.quantity) : 0;
    const newQty = currentQty + body.delta;

    const change = await createChangeRequest({
      entityType: "inventory",
      entityId: `${params.storeId}:${params.productId}`,
      fieldName: "quantity",
      oldValue: String(currentQty),
      newValue: String(newQty),
      reason: body.reason,
      userId: req.auth.userId,
    });

    res.status(201).json({ changeRequest: change });
  } catch (error) {
    if (handleZod(error, next)) return;
    next(error);
  }
}

export async function transferStockHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");

    const body = transferBodySchema.parse(req.body);
    assertStoreAccess(req.auth, body.from_store_id);
    assertStoreAccess(req.auth, body.to_store_id);
    const result = await transferStock({
      fromStoreId: body.from_store_id,
      toStoreId: body.to_store_id,
      productId: body.product_id,
      quantity: body.quantity,
      reason: body.reason,
      userId: req.auth.userId,
    });

    res.status(201).json(result);
  } catch (error) {
    if (handleZod(error, next)) return;
    next(error);
  }
}
