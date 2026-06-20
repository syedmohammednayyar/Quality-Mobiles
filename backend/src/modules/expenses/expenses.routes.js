import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { applyStoreFilter, resolveStoreContext } from "../../middleware/storeScope.js";
import {
  createExpenseHandler,
  deleteExpenseHandler,
  listExpensesHandler,
  updateExpenseHandler,
} from "./expenses.controller.js";

export const expensesRouter = Router();

expensesRouter.use(authenticate);
expensesRouter.use(resolveStoreContext);
expensesRouter.use(applyStoreFilter);

expensesRouter.get(
  "/",
  authorize("admin", "manager", "employee"),
  listExpensesHandler,
);
expensesRouter.post("/", authorize("admin", "manager"), createExpenseHandler);
expensesRouter.patch(
  "/:expenseId",
  authorize("admin", "manager"),
  updateExpenseHandler,
);
expensesRouter.delete(
  "/:expenseId",
  authorize("admin"),
  deleteExpenseHandler,
);
