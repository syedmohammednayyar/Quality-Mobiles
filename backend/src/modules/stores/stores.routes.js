import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { applyStoreFilter, resolveStoreContext } from "../../middleware/storeScope.js";
import {
  listStoresHandler,
  updateStoreHandler,
} from "./stores.controller.js";

export const storesRouter = Router();

storesRouter.use(authenticate);
storesRouter.use(resolveStoreContext);
storesRouter.use(applyStoreFilter);

storesRouter.get(
  "/",
  authorize("admin", "manager", "employee"),
  listStoresHandler,
);
storesRouter.patch(
  "/:storeId",
  authorize("admin", "manager"),
  updateStoreHandler,
);
