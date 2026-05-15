import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  adjustInventoryHandler,
  listLowStockHandler,
  listInventoryByQueryHandler,
  listInventoryHandler,
  listStoresHandler,
  transferStockHandler,
} from "./inventory.controller.js";

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

inventoryRouter.get(
  "/stores",
  authorize("admin", "manager", "cashier", "inventory_manager"),
  listStoresHandler,
);

inventoryRouter.get(
  "/",
  authorize("admin", "manager", "cashier", "inventory_manager"),
  listInventoryByQueryHandler,
);

inventoryRouter.get(
  "/:storeId",
  authorize("admin", "manager", "cashier", "inventory_manager"),
  listInventoryHandler,
);

inventoryRouter.get(
  "/:storeId/low-stock",
  authorize("admin", "manager", "inventory_manager"),
  listLowStockHandler,
);

inventoryRouter.patch(
  "/:storeId/:productId/adjust",
  authorize("admin", "manager", "inventory_manager"),
  adjustInventoryHandler,
);

inventoryRouter.post(
  "/transfers",
  authorize("admin", "manager", "inventory_manager"),
  transferStockHandler,
);
