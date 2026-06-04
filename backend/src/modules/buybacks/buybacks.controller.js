import { z } from "zod";
import { Buyback } from "../../db/models.js";
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
const extraFields = {
  serial_number: z.string().max(100).optional(),
  battery_health: z.coerce.number().min(0).max(100).optional(),
  accessories_received: z.array(z.string().max(100)).optional(),
  box_available: z.boolean().optional(),
  charger_available: z.boolean().optional(),
  physical_inspection: z.record(z.any()).optional(),
  functional_inspection: z.record(z.any()).optional(),
  damage_detection: z.record(z.any()).optional(),
  condition_deduction: z.coerce.number().min(0).optional(),
  final_valuation: z.coerce.number().min(0).optional(),
  suggested_resale_price: z.coerce.number().min(0).optional(),
  exchange_credit_amount: z.coerce.number().min(0).optional(),
  cash_payout_amount: z.coerce.number().min(0).optional(),
  rack_location: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  inspection_notes: z.string().max(2000).optional(),
  pricing_notes: z.string().max(2000).optional(),
  resale_notes: z.string().max(2000).optional(),
};

const createBuybackSchema = z.object({
  ...extraFields,
  imei: z.string().regex(/^\d{15}$/),
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  color: z.string().max(60).optional(),
  customer: objectIdSchema.nullable().optional(),
  store_ref: objectIdSchema,
  job_no: z.string().max(80).optional(),
  ic_number: z.string().max(80).optional(),
  customer_name: z.string().max(150).optional(),
  dealer_name: z.string().max(150).optional(),
  customer_contact_number: z.string().max(40).optional(),
  dealer_contact_number: z.string().max(40).optional(),
  ram_variant: z.string().max(60).optional(),
  storage_variant: z.string().max(60).optional(),
  condition_assessed: z.boolean().optional(),
  payout_method: z.string().max(40).optional(),
  service_ready_status: z.string().max(80).optional(),
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
  ...extraFields,
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
  customer_name: z.string().max(150).optional(),
  dealer_name: z.string().max(150).optional(),
  customer_contact_number: z.string().max(40).optional(),
  dealer_contact_number: z.string().max(40).optional(),
  ram_variant: z.string().max(60).optional(),
  storage_variant: z.string().max(60).optional(),
  condition_assessed: z.boolean().optional(),
  payout_method: z.string().max(40).optional(),
  service_ready_status: z.string().max(80).optional(),
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
        customerName: payload.customer_name,
        dealerName: payload.dealer_name,
        customerContactNumber: payload.customer_contact_number,
        dealerContactNumber: payload.dealer_contact_number,
        ramVariant: payload.ram_variant,
        storageVariant: payload.storage_variant,
        conditionAssessed: payload.condition_assessed,
        payoutMethod: payload.payout_method,
        serviceReadyStatus: payload.service_ready_status,
        icNumber: payload.ic_number,
        cashAmount: payload.cash_amount,
        onlineAmount: payload.online_amount,
        exchangeAmount: payload.exchange_amount,
        exchangeModel: payload.exchange_model,
        condition: payload.condition,
        marketValue: payload.market_value,
        negotiatedPrice: payload.negotiated_price,
        status: payload.status,
        ...payload,
        cashAmount: payload.cash_payout_amount,
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
    const existing = await Buyback.findById(params.buybackId).select("store").lean();
    if (!existing) throw new HttpError(404, "Buyback not found", "BUYBACK_NOT_FOUND");
    if (existing.store) assertStoreAccess(req.auth, existing.store);
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
        customerName: payload.customer_name,
        dealerName: payload.dealer_name,
        customerContactNumber: payload.customer_contact_number,
        dealerContactNumber: payload.dealer_contact_number,
        ramVariant: payload.ram_variant,
        storageVariant: payload.storage_variant,
        conditionAssessed: payload.condition_assessed,
        payoutMethod: payload.payout_method,
        serviceReadyStatus: payload.service_ready_status,
        icNumber: payload.ic_number,
        cashAmount: payload.cash_amount,
        onlineAmount: payload.online_amount,
        exchangeAmount: payload.exchange_amount,
        exchangeModel: payload.exchange_model,
        condition: payload.condition,
        marketValue: payload.market_value,
        negotiatedPrice: payload.negotiated_price,
        status: payload.status,
        ...payload,
        cashAmount: payload.cash_payout_amount,
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
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }
    const params = buybackIdParamsSchema.parse(req.params);
    const existing = await Buyback.findById(params.buybackId).select("store").lean();
    if (!existing) throw new HttpError(404, "Buyback not found", "BUYBACK_NOT_FOUND");
    if (existing.store) assertStoreAccess(req.auth, existing.store);
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
