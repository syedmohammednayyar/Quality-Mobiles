import { Expense, Store } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";

function toMoney(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, "Invalid money value", "EXPENSE_INVALID_AMOUNT");
  }
  return parsed.toFixed(2);
}

function mapExpense(doc) {
  return {
    id: doc._id.toString(),
    store_ref: doc.store ? doc.store.toString() : null,
    reason: doc.reason,
    out_cash: toMoney(doc.outCash),
    out_online: toMoney(doc.outOnline),
    expense_date: doc.expenseDate ? doc.expenseDate.toISOString().split('T')[0] : null,
    notes: doc.notes || "",
    created_at: doc.createdAt,
  };
}

async function requireStore(storeId) {
  const exists = await Store.exists({ _id: storeId, isActive: { $ne: false } });
  if (!exists) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  }
}

async function getExpenseDoc(expenseId) {
  const expense = await Expense.findById(expenseId);
  if (!expense) {
    throw new HttpError(404, "Expense not found", "EXPENSE_NOT_FOUND");
  }
  return expense;
}

export async function listExpenses(input = {}) {
  const query = input.storeId ? { store: input.storeId } : {};
  const expenses = await Expense.find(query).sort({ expenseDate: -1, createdAt: -1 });
  return expenses.map(mapExpense);
}

export async function createExpense(input, userId) {
  return withTransaction(async (session) => {
    const reason = input.reason.trim();
    if (!reason) {
      throw new HttpError(
        400,
        "Expense reason is required",
        "EXPENSE_REQUIRED_REASON",
      );
    }

    if (input.storeRef) {
      await requireStore(input.storeRef);
    }

    const [expense] = await Expense.create([{
      store: input.storeRef || null,
      reason,
      outCash: Number(input.outCash || 0),
      outOnline: Number(input.outOnline || 0),
      expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
      notes: (input.notes || "").trim() || null,
      createdBy: userId,
    }], { session });

    return mapExpense(expense);
  });
}

export async function updateExpense(expenseId, input) {
  return withTransaction(async (session) => {
    const expense = await getExpenseDoc(expenseId);

    if (input.storeRef !== undefined) {
      if (input.storeRef) {
        await requireStore(input.storeRef);
      }
      expense.store = input.storeRef || null;
    }

    if (input.reason !== undefined) {
      const reason = input.reason.trim();
      if (!reason) {
        throw new HttpError(
          400,
          "Expense reason is required",
          "EXPENSE_REQUIRED_REASON",
        );
      }
      expense.reason = reason;
    }

    if (input.outCash !== undefined) {
      expense.outCash = Number(input.outCash || 0);
    }

    if (input.outOnline !== undefined) {
      expense.outOnline = Number(input.outOnline || 0);
    }

    if (input.expenseDate !== undefined) {
      expense.expenseDate = new Date(input.expenseDate);
    }

    if (input.notes !== undefined) {
      expense.notes = (input.notes || "").trim() || null;
    }

    await expense.save({ session });

    return mapExpense(expense);
  });
}

export async function deleteExpense(expenseId) {
  await withTransaction(async (session) => {
    const result = await Expense.deleteOne({ _id: expenseId }, { session });
    if (result.deletedCount === 0) {
      throw new HttpError(404, "Expense not found", "EXPENSE_NOT_FOUND");
    }
  });
}
