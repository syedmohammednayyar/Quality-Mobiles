import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { applyStoreFilter, resolveStoreContext } from "../../middleware/storeScope.js";
import {
  createProductHandler,
  deleteProductHandler,
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
  authorize("admin"),
  updateProductHandler,
);
productsRouter.delete("/:productId", authorize("admin"), deleteProductHandler);
