import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { assertStoreAccess, isAdmin } from "../../utils/storeAccess.js";
import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
} from "./expenses.service.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

const createExpenseSchema = z.object({
  store_ref: objectIdSchema.nullable().optional(),
  reason: z.string().min(1).max(220),
  out_cash: z.coerce.number().min(0),
  out_online: z.coerce.number().min(0),
  expense_date: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

const updateExpenseSchema = z.object({
  store_ref: objectIdSchema.nullable().optional(),
  reason: z.string().min(1).max(220).optional(),
  out_cash: z.coerce.number().min(0).optional(),
  out_online: z.coerce.number().min(0).optional(),
  expense_date: z.string().min(1).optional(),
  notes: z.string().max(1000).optional(),
});

const expenseIdParamsSchema = z.object({
  expenseId: objectIdSchema,
});

export async function listExpensesHandler(req, res, next) {
  try {
    const storeId = isAdmin(req.auth) ? undefined : req.auth?.store_id;
    const rows = await listExpenses({ storeId });
    res.status(200).json({ rows });
  } catch (error) {
    next(error);
  }
}

export async function createExpenseHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }

    const payload = createExpenseSchema.parse(req.body);
    if (payload.store_ref) assertStoreAccess(req.auth, payload.store_ref);
    const row = await createExpense(
      {
        storeRef: payload.store_ref,
        reason: payload.reason,
        outCash: payload.out_cash,
        outOnline: payload.out_online,
        expenseDate: payload.expense_date,
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

export async function updateExpenseHandler(req, res, next) {
  try {
    const params = expenseIdParamsSchema.parse(req.params);
    const payload = updateExpenseSchema.parse(req.body);
    if (payload.store_ref) assertStoreAccess(req.auth, payload.store_ref);

    const row = await updateExpense(params.expenseId, {
      storeRef: payload.store_ref,
      reason: payload.reason,
      outCash: payload.out_cash,
      outOnline: payload.out_online,
      expenseDate: payload.expense_date,
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

export async function deleteExpenseHandler(req, res, next) {
  try {
    const params = expenseIdParamsSchema.parse(req.params);
    await deleteExpense(params.expenseId);
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
