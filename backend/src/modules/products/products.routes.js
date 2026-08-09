import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { applyStoreFilter, resolveStoreContext } from "../../middleware/storeScope.js";
import {
  createProductHandler,
  deleteProductHandler,
  getProductHistoryHandler,
  listProductsHandler,
  updateProductHandler,
} from "./products.controller.js";

export const productsRouter = Router();

productsRouter.use(authenticate);
productsRouter.use(resolveStoreContext);
productsRouter.use(applyStoreFilter);

productsRouter.get(
  "/",
  authorize("admin", "manager", "cashier", "inventory_manager"),
  listProductsHandler,
);
productsRouter.post(
  "/",
  authorize("admin", "manager"),
  createProductHandler,
);
productsRouter.patch(
  "/:productId",
  authorize("admin", { message: "You do not have permission to edit product details. Only an administrator can change product master data." }),
  updateProductHandler,
);
productsRouter.get(
  "/:productId/history",
  authorize("admin", "manager"),
  getProductHistoryHandler,
);
productsRouter.delete("/:productId", authorize("admin"), deleteProductHandler);
