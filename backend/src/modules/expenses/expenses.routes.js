import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createExpenseHandler,
  deleteExpenseHandler,
  listExpensesHandler,
  updateExpenseHandler,
} from "./expenses.controller.js";

export const expensesRouter = Router();

expensesRouter.use(authenticate);

expensesRouter.get(
  "/",
  authorize("admin", "manager", "inventory_manager"),
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
