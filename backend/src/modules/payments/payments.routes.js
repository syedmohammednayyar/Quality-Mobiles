import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { applyStoreFilter, resolveStoreContext } from "../../middleware/storeScope.js";
import {
  createPaymentEntryHandler,
  deletePaymentEntryHandler,
  listOutstandingBalancesHandler,
  listPaymentEntriesHandler,
  updatePaymentEntryHandler,
} from "./payments.controller.js";

export const paymentsRouter = Router();

paymentsRouter.use(authenticate);
paymentsRouter.use(resolveStoreContext);
paymentsRouter.use(applyStoreFilter);

paymentsRouter.get(
  "/",
  authorize("admin", "manager", "inventory_manager"),
  listPaymentEntriesHandler,
);
paymentsRouter.get(
  "/outstanding",
  authorize("admin", "manager", "inventory_manager"),
  listOutstandingBalancesHandler,
);
paymentsRouter.post(
  "/",
  authorize("admin", "manager"),
  createPaymentEntryHandler,
);
paymentsRouter.patch(
  "/:paymentEntryId",
  authorize("admin", "manager"),
  updatePaymentEntryHandler,
);
paymentsRouter.delete(
  "/:paymentEntryId",
  authorize("admin"),
  deletePaymentEntryHandler,
);
