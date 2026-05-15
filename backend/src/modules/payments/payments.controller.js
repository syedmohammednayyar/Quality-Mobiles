import { z } from "zod";
import { PaymentEntry } from "../../db/models.js";
import { HttpError } from "../../utils/httpError.js";
import { assertStoreAccess, isAdmin } from "../../utils/storeAccess.js";
import {
  createPaymentEntry,
  deletePaymentEntry,
  listOutstandingBalances,
  listPaymentEntries,
  updatePaymentEntry,
} from "./payments.service.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

const paymentEntrySchema = z.object({
  store_ref: objectIdSchema.nullable().optional(),
  entry_type: z.enum(["in", "out"]),
  dealer_name: z.string().min(1).max(180),
  cash_amount: z.coerce.number().min(0),
  online_amount: z.coerce.number().min(0),
  payment_status: z.enum(["pending", "partial", "paid"]).optional(),
  outstanding_amount: z.coerce.number().min(0).optional(),
  entry_date: z.string().min(1),
  source_type: z.string().max(20).optional().nullable(),
  source_id: objectIdSchema.optional().nullable(),
  notes: z.string().max(1000).optional(),
});

const updatePaymentEntrySchema = paymentEntrySchema.partial();

const paymentEntryIdParamsSchema = z.object({
  paymentEntryId: objectIdSchema,
});

export async function listPaymentEntriesHandler(req, res, next) {
  try {
    const storeId = isAdmin(req.auth) ? undefined : req.auth?.store_id;
    const rows = await listPaymentEntries({ storeId });
    res.status(200).json({ rows });
  } catch (error) {
    next(error);
  }
}

export async function listOutstandingBalancesHandler(req, res, next) {
  try {
    const storeId = isAdmin(req.auth) ? undefined : req.auth?.store_id;
    const rows = await listOutstandingBalances({ storeId });
    res.status(200).json({ rows });
  } catch (error) {
    next(error);
  }
}

export async function createPaymentEntryHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }

    const payload = paymentEntrySchema.parse(req.body);
    if (payload.store_ref) assertStoreAccess(req.auth, payload.store_ref);
    const row = await createPaymentEntry(
      {
        storeRef: payload.store_ref,
        entryType: payload.entry_type,
        dealerName: payload.dealer_name,
        cashAmount: payload.cash_amount,
        onlineAmount: payload.online_amount,
        paymentStatus: payload.payment_status,
        outstandingAmount: payload.outstanding_amount,
        entryDate: payload.entry_date,
        sourceType: payload.source_type,
        sourceId: payload.source_id,
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

export async function updatePaymentEntryHandler(req, res, next) {
  try {
    const params = paymentEntryIdParamsSchema.parse(req.params);
    const payload = updatePaymentEntrySchema.parse(req.body);
    const existing = await PaymentEntry.findById(params.paymentEntryId).select("store").lean();
    if (!existing) throw new HttpError(404, "Payment entry not found", "PAYMENT_NOT_FOUND");
    if (existing.store) assertStoreAccess(req.auth, existing.store);
    if (payload.store_ref) assertStoreAccess(req.auth, payload.store_ref);

    const row = await updatePaymentEntry(params.paymentEntryId, {
      storeRef: payload.store_ref,
      entryType: payload.entry_type,
      dealerName: payload.dealer_name,
      cashAmount: payload.cash_amount,
      onlineAmount: payload.online_amount,
      paymentStatus: payload.payment_status,
      outstandingAmount: payload.outstanding_amount,
      entryDate: payload.entry_date,
      sourceType: payload.source_type,
      sourceId: payload.source_id,
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

export async function deletePaymentEntryHandler(req, res, next) {
  try {
    const params = paymentEntryIdParamsSchema.parse(req.params);
    const existing = await PaymentEntry.findById(params.paymentEntryId).select("store").lean();
    if (!existing) throw new HttpError(404, "Payment entry not found", "PAYMENT_NOT_FOUND");
    if (existing.store) assertStoreAccess(req.auth, existing.store);
    await deletePaymentEntry(params.paymentEntryId);
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
