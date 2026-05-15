import { z } from "zod";
import { Repair } from "../../db/models.js";
import { HttpError } from "../../utils/httpError.js";
import { assertStoreAccess, isAdmin } from "../../utils/storeAccess.js";
import {
  createRepair,
  deleteRepair,
  listRepairs,
  updateRepair,
} from "./repairs.service.js";

const repairStatusSchema = z.enum([
  "Pending",
  "In Progress",
  "Completed",
  "Delivered",
  "Cancelled",
]);
const partStatusSchema = z.enum(["Pending", "Purchased"]);
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

const repairPartSchema = z.object({
  name: z.string().min(1).max(150),
  qty: z.number().int().positive(),
  unitCost: z.coerce.number().min(0),
  status: partStatusSchema,
});

const createRepairSchema = z.object({
  ticket_no: z.string().min(1).max(50),
  customer_name: z.string().min(1).max(150),
  customer: objectIdSchema.nullable().optional(),
  store_ref: objectIdSchema.nullable().optional(),
  device_model: z.string().min(1).max(160),
  problem: z.string().max(500).optional(),
  technician_name: z.string().max(150).optional(),
  status: repairStatusSchema.optional(),
  parts: z.array(repairPartSchema).optional(),
  parts_charge: z.coerce.number().min(0).optional(),
  labor_cost: z.coerce.number().min(0).optional(),
  got_amount: z.coerce.number().min(0).optional(),
  in_cash: z.coerce.number().min(0).optional(),
  in_online: z.coerce.number().min(0).optional(),
  out_cash: z.coerce.number().min(0).optional(),
  out_online: z.coerce.number().min(0).optional(),
  warranty: z.enum(["3 months", "6 months", "12 months"]).optional(),
  estimated_completion: z.string().optional().nullable(),
  notes: z.string().max(1000).optional(),
});

const updateRepairSchema = createRepairSchema.partial();

const repairIdParamsSchema = z.object({
  repairId: objectIdSchema,
});

export async function listRepairsHandler(req, res, next) {
  try {
    const storeId = isAdmin(req.auth) ? undefined : req.auth?.store_id;
    const rows = await listRepairs({ storeId });
    res.status(200).json({ rows });
  } catch (error) {
    next(error);
  }
}

export async function createRepairHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }

    const payload = createRepairSchema.parse(req.body);
    if (payload.store_ref) assertStoreAccess(req.auth, payload.store_ref);
    const row = await createRepair(
      {
        ticketNo: payload.ticket_no,
        customerName: payload.customer_name,
        customer: payload.customer,
        storeRef: payload.store_ref,
        deviceModel: payload.device_model,
        problem: payload.problem,
        technicianName: payload.technician_name,
        status: payload.status,
        parts: payload.parts,
        partsCharge: payload.parts_charge,
        laborCost: payload.labor_cost,
        gotAmount: payload.got_amount,
        inCash: payload.in_cash,
        inOnline: payload.in_online,
        outCash: payload.out_cash,
        outOnline: payload.out_online,
        warranty: payload.warranty,
        estimatedCompletion: payload.estimated_completion,
        notes: payload.notes,
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

export async function updateRepairHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }
    const params = repairIdParamsSchema.parse(req.params);
    const payload = updateRepairSchema.parse(req.body);
    const existing = await Repair.findById(params.repairId).select("store").lean();
    if (!existing) throw new HttpError(404, "Repair not found", "REPAIR_NOT_FOUND");
    if (existing.store) assertStoreAccess(req.auth, existing.store);
    if (payload.store_ref) assertStoreAccess(req.auth, payload.store_ref);

    const row = await updateRepair(params.repairId, {
      ticketNo: payload.ticket_no,
      customerName: payload.customer_name,
      customer: payload.customer,
      storeRef: payload.store_ref,
      deviceModel: payload.device_model,
      problem: payload.problem,
      technicianName: payload.technician_name,
      status: payload.status,
      parts: payload.parts,
      partsCharge: payload.parts_charge,
      laborCost: payload.labor_cost,
      gotAmount: payload.got_amount,
      inCash: payload.in_cash,
      inOnline: payload.in_online,
      outCash: payload.out_cash,
      outOnline: payload.out_online,
      warranty: payload.warranty,
      estimatedCompletion: payload.estimated_completion,
      notes: payload.notes,
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

export async function deleteRepairHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }
    const params = repairIdParamsSchema.parse(req.params);
    const existing = await Repair.findById(params.repairId).select("store").lean();
    if (!existing) throw new HttpError(404, "Repair not found", "REPAIR_NOT_FOUND");
    if (existing.store) assertStoreAccess(req.auth, existing.store);
    await deleteRepair(params.repairId);
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
