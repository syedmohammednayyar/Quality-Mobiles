import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { assertStoreAccess, isAdmin } from "../../utils/storeAccess.js";
import {
  createSale,
  deleteSale,
  getSaleById,
  listSales,
  lookupSaleJob,
  updateSale,
} from "./sales.service.js";

const paymentMethodSchema = z.enum([
  "cash",
  "card",
  "bank_transfer",
  "upi",
  "wallet",
  "mixed",
]);

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

const createSaleSchema = z.object({
  storeId: objectIdSchema,
  customerId: objectIdSchema.optional(),
  discountTotal: z.number().min(0).default(0),
  exchangeTotal: z.number().min(0).default(0),
  jobNumber: z.string().max(80).optional(),
  icNumber: z.string().max(80).optional(),
  cashAmount: z.number().min(0).optional(),
  onlineAmount: z.number().min(0).optional(),
  exchangeModel: z.string().max(150).optional(),
  gotAmount: z.number().min(0).optional(),
  gift: z.string().max(150).optional(),
  salespersonName: z.string().max(150).optional(),
  attendedBy: objectIdSchema.optional(),
  customerSource: z.enum(["walk_in", "referred"]).optional(),
  referredByEmployee: objectIdSchema.optional(),
  referralNotes: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productId:          objectIdSchema,
        quantity:           z.number().int().positive(),
        unitPrice:          z.number().min(0).optional(),
        adjustedUnitPrice:  z.number().min(0).optional(),
        adjustmentReason:   z.string().max(500).optional(),
        adjustmentCategory: z.enum(["negotiation", "loyalty_discount", "damage", "bulk", "promotion", "manager_override", "other"]).optional(),
      }),
    )
    .min(1),
  exchangeDevices: z
    .array(
      z.object({
        brand:           z.string().max(100),
        model:           z.string().max(150),
        imei:            z.string().max(50).optional(),
        storageCapacity: z.string().max(50).optional(),
        color:           z.string().max(80).optional(),
        condition:       z.enum(["excellent", "good", "fair", "poor", "broken"]).default("good"),
        conditionNotes:  z.string().max(500).optional(),
        marketValue:     z.number().min(0).optional(),
        exchangeValue:   z.number().min(0),
      }),
    )
    .optional(),
  payments: z
    .array(
      z.object({
        paymentMethod: paymentMethodSchema,
        amount: z.number().positive(),
        referenceNo: z.string().max(120).optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .default([]),
});

const updateSaleSchema = z.object({
  customerId: objectIdSchema.nullable().optional(),
  storeId: objectIdSchema.optional(),
  cashAmount: z.number().min(0).optional(),
  onlineAmount: z.number().min(0).optional(),
  note: z.string().max(500).optional(),
});

const saleIdParamsSchema = z.object({
  saleId: objectIdSchema,
});

const jobLookupParamsSchema = z.object({
  jobNumber: z.string().min(1).max(120),
});

const listSalesQuerySchema = z.object({
  store_id: objectIdSchema.optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function listSalesHandler(req, res, next) {
  try {
    const query = listSalesQuerySchema.parse(req.query);
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }
    let storeId = query.store_id;
    if (!isAdmin(req.auth)) {
      storeId = assertStoreAccess(req.auth, req.auth.store_id);
    } else if (storeId) {
      assertStoreAccess(req.auth, storeId);
    }
    const rows = await listSales({
      storeId,
      limit: query.limit,
      offset: query.offset,
    });

    res.status(200).json({ rows });
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

export async function createSaleHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }

    const payload = createSaleSchema.parse(req.body);
    assertStoreAccess(req.auth, payload.storeId);

    const result = await createSale({
      ...payload,
      userId: req.auth.userId,
    });

    res.status(201).json(result);
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

export async function lookupSaleJobHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }
    const params = jobLookupParamsSchema.parse(req.params);
    const result = await lookupSaleJob(params.jobNumber, req.auth);
    res.status(200).json(result);
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

export async function getSaleByIdHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }
    const params = saleIdParamsSchema.parse(req.params);
    const result = await getSaleById(params.saleId);
    assertStoreAccess(req.auth, result.sale.store);
    res.status(200).json(result);
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

export async function updateSaleHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }

    const params = saleIdParamsSchema.parse(req.params);
    const payload = updateSaleSchema.parse(req.body);
    const existing = await getSaleById(params.saleId);
    assertStoreAccess(req.auth, existing.sale.store);
    if (payload.storeId) assertStoreAccess(req.auth, payload.storeId);

    const result = await updateSale(params.saleId, {
      customerId: payload.customerId,
      storeId: payload.storeId,
      cashAmount: payload.cashAmount,
      onlineAmount: payload.onlineAmount,
      note: payload.note,
      userId: req.auth.userId,
    });

    res.status(200).json(result);
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

export async function deleteSaleHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }

    const params = saleIdParamsSchema.parse(req.params);
    const existing = await getSaleById(params.saleId);
    assertStoreAccess(req.auth, existing.sale.store);
    await deleteSale(params.saleId, req.auth.userId);
    res.status(204).send();
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
