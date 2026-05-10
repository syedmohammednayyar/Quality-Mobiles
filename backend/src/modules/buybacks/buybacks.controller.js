import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { assertStoreAccess, isAdmin } from "../../utils/storeAccess.js";
import {
  createBuyback,
  deleteBuyback,
  listBuybacks,
  updateBuyback,
} from "./buybacks.service.js";

const buybackConditionSchema = z.enum(["Excellent", "Good", "Fair", "Poor"]);
const buybackStatusSchema = z.enum([
  "Pending",
  "Accepted",
  "Processed",
  "Rejected",
]);
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

const createBuybackSchema = z.object({
  imei: z.string().regex(/^\d{15}$/),
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  color: z.string().max(60).optional(),
  customer: objectIdSchema.nullable().optional(),
  store_ref: objectIdSchema.nullable().optional(),
  job_no: z.string().max(80).optional(),
  ic_number: z.string().max(80).optional(),
  cash_amount: z.coerce.number().min(0).optional(),
  online_amount: z.coerce.number().min(0).optional(),
  exchange_amount: z.coerce.number().min(0).optional(),
  exchange_model: z.string().max(150).optional(),
  condition: buybackConditionSchema,
  market_value: z.coerce.number().min(0),
  negotiated_price: z.coerce.number().min(0),
  status: buybackStatusSchema.optional(),
});

const updateBuybackSchema = z.object({
  imei: z
    .string()
    .regex(/^\d{15}$/)
    .optional(),
  brand: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  color: z.string().max(60).optional(),
  customer: objectIdSchema.nullable().optional(),
  store_ref: objectIdSchema.nullable().optional(),
  job_no: z.string().max(80).optional(),
  ic_number: z.string().max(80).optional(),
  cash_amount: z.coerce.number().min(0).optional(),
  online_amount: z.coerce.number().min(0).optional(),
  exchange_amount: z.coerce.number().min(0).optional(),
  exchange_model: z.string().max(150).optional(),
  condition: buybackConditionSchema.optional(),
  market_value: z.coerce.number().min(0).optional(),
  negotiated_price: z.coerce.number().min(0).optional(),
  status: buybackStatusSchema.optional(),
});

const buybackIdParamsSchema = z.object({
  buybackId: objectIdSchema,
});

export async function listBuybacksHandler(req, res, next) {
  try {
    const storeId = isAdmin(req.auth) ? undefined : req.auth?.store_id;
    const rows = await listBuybacks({ storeId });
    res.status(200).json({ rows });
  } catch (error) {
    next(error);
  }
}

export async function createBuybackHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }

    const payload = createBuybackSchema.parse(req.body);
    if (payload.store_ref) assertStoreAccess(req.auth, payload.store_ref);
    const row = await createBuyback(
      {
        imei: payload.imei,
        brand: payload.brand,
        model: payload.model,
        color: payload.color,
        customer: payload.customer,
        storeRef: payload.store_ref,
        jobNo: payload.job_no,
        icNumber: payload.ic_number,
        cashAmount: payload.cash_amount,
        onlineAmount: payload.online_amount,
        exchangeAmount: payload.exchange_amount,
        exchangeModel: payload.exchange_model,
        condition: payload.condition,
        marketValue: payload.market_value,
        negotiatedPrice: payload.negotiated_price,
        status: payload.status,
      },
      req.auth.userId,
    );

    res.status(201).json(row);
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

export async function updateBuybackHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }

    const params = buybackIdParamsSchema.parse(req.params);
    const payload = updateBuybackSchema.parse(req.body);
    if (payload.store_ref) assertStoreAccess(req.auth, payload.store_ref);

    const row = await updateBuyback(
      params.buybackId,
      {
        imei: payload.imei,
        brand: payload.brand,
        model: payload.model,
        color: payload.color,
        customer: payload.customer,
        storeRef: payload.store_ref,
        jobNo: payload.job_no,
        icNumber: payload.ic_number,
        cashAmount: payload.cash_amount,
        onlineAmount: payload.online_amount,
        exchangeAmount: payload.exchange_amount,
        exchangeModel: payload.exchange_model,
        condition: payload.condition,
        marketValue: payload.market_value,
        negotiatedPrice: payload.negotiated_price,
        status: payload.status,
      },
      req.auth.userId,
    );

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

export async function deleteBuybackHandler(req, res, next) {
  try {
    const params = buybackIdParamsSchema.parse(req.params);
    await deleteBuyback(params.buybackId);
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
