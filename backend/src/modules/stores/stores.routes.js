import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createStoreHandler,
  deleteStoreHandler,
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
storesRouter.post("/", authorize("admin"), createStoreHandler);
storesRouter.patch(
  "/:storeId",
  authorize("admin"),
  updateStoreHandler,
);
storesRouter.delete(
  "/:storeId",
  authorize("admin"),
  deleteStoreHandler,
);
