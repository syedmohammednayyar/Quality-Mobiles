import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { applyStoreFilter, resolveStoreContext } from "../../middleware/storeScope.js";
import {
  createCustomerHandler,
  deleteCustomerHandler,
  listCustomersHandler,
  updateCustomerHandler,
} from "./customers.controller.js";

export const customersRouter = Router();

customersRouter.use(authenticate);
customersRouter.use(resolveStoreContext);
customersRouter.use(applyStoreFilter);

customersRouter.get(
  "/",
  authorize("admin", "manager", "employee"),
  listCustomersHandler,
);
customersRouter.post(
  "/",
  authorize("admin", "manager", "employee"),
  createCustomerHandler,
);
customersRouter.patch(
  "/:customerId",
  authorize("admin", "manager", "employee"),
  updateCustomerHandler,
);
customersRouter.delete(
  "/:customerId",
  authorize("admin", "manager", "employee"),
  deleteCustomerHandler,
);
