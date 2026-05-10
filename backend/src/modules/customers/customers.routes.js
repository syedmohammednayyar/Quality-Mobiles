import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createCustomerHandler,
  deleteCustomerHandler,
  listCustomersHandler,
  updateCustomerHandler,
} from "./customers.controller.js";

export const customersRouter = Router();

customersRouter.use(authenticate);

customersRouter.get(
  "/",
  authorize("admin", "manager", "cashier", "inventory_manager"),
  listCustomersHandler,
);
customersRouter.post(
  "/",
  authorize("admin", "manager", "cashier"),
  createCustomerHandler,
);
customersRouter.patch(
  "/:customerId",
  authorize("admin", "manager", "cashier"),
  updateCustomerHandler,
);
customersRouter.delete(
  "/:customerId",
  authorize("admin", "manager", "cashier"),
  deleteCustomerHandler,
);
