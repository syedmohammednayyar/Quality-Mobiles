import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import {
  exportLossesToCSV,
  getLossById,
  getLossByEmployee,
  getLossByProduct,
  getLossByReason,
  getLossByStore,
  getLossSummary,
  getLossTrend,
  listLosses,
} from "./losses.service.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

function parseStoreIds(raw) {
  if (!raw) return [];
  return String(raw).split(",").map((x) => x.trim()).filter(Boolean);
}

function scopedStoreIds(req) {
  const requested = parseStoreIds(req.query.storeIds);
  if (req.auth?.roles?.includes("admin")) return requested;
  return req.auth?.store_id ? [String(req.auth.store_id)] : [];
}

const filtersQuerySchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  employeeId: objectIdSchema.optional(),
  productId: objectIdSchema.optional(),
  brand: z.string().max(100).optional(),
  productType: z.enum(["new_phone", "used_phone", "accessory", "service", "repair_part"]).optional(),
  lossType: z.enum(["DISCOUNT_BELOW_COST", "BUYBACK_RESALE_LOSS", "CLEARANCE_SALE", "PRICE_ADJUSTMENT", "DAMAGED_STOCK", "OTHER"]).optional(),
  lossStatus: z.enum(["active", "reversed"]).optional(),
  search: z.string().max(120).optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

function buildFilters(req) {
  const parsed = filtersQuerySchema.parse(req.query);
  return { ...parsed, storeIds: scopedStoreIds(req) };
}

function handleError(error, next) {
  if (error instanceof z.ZodError) {
    next(new HttpError(400, error.issues[0]?.message || "Invalid request", "VALIDATION_ERROR"));
    return;
  }
  next(error);
}

export async function listLossesHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const result = await listLosses(buildFilters(req));
    res.status(200).json({ success: true, data: result });
  } catch (error) { handleError(error, next); }
}

export async function getLossByIdHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const { id } = z.object({ id: objectIdSchema }).parse(req.params);
    const loss = await getLossById(id);
    if (!req.auth.roles.includes("admin") && String(loss.store_id) !== String(req.auth.store_id)) {
      throw new HttpError(403, "Store access denied", "STORE_ACCESS_DENIED");
    }
    res.status(200).json({ success: true, data: loss });
  } catch (error) { handleError(error, next); }
}

export async function getLossSummaryHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const summary = await getLossSummary(buildFilters(req));
    res.status(200).json({ success: true, data: summary });
  } catch (error) { handleError(error, next); }
}

export async function getLossByStoreHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const rows = await getLossByStore(buildFilters(req));
    res.status(200).json({ success: true, data: rows });
  } catch (error) { handleError(error, next); }
}

export async function getLossByEmployeeHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const rows = await getLossByEmployee(buildFilters(req));
    res.status(200).json({ success: true, data: rows });
  } catch (error) { handleError(error, next); }
}

export async function getLossByProductHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const rows = await getLossByProduct(buildFilters(req));
    res.status(200).json({ success: true, data: rows });
  } catch (error) { handleError(error, next); }
}

export async function getLossByReasonHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const rows = await getLossByReason(buildFilters(req));
    res.status(200).json({ success: true, data: rows });
  } catch (error) { handleError(error, next); }
}

export async function getLossTrendHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const rows = await getLossTrend(buildFilters(req));
    res.status(200).json({ success: true, data: rows });
  } catch (error) { handleError(error, next); }
}

export async function exportLossesHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const { csv } = await exportLossesToCSV(buildFilters(req), req.auth.userId);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="loss_report_${Date.now()}.csv"`);
    res.send(`﻿${csv}`);
  } catch (error) { handleError(error, next); }
}
