import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  listStoresHandler,
  updateStoreHandler,
} from "./stores.controller.js";

export const storesRouter = Router();

storesRouter.use(authenticate);

storesRouter.get(
  "/",
  authorize("admin", "manager", "cashier", "inventory_manager"),
  listStoresHandler,
);
storesRouter.patch(
  "/:storeId",
  authorize("admin", "manager"),
  updateStoreHandler,
);
