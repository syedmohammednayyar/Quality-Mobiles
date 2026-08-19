import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { applyStoreFilter, resolveStoreContext } from "../../middleware/storeScope.js";
import {
  createProductHandler,
  deleteProductHandler,
  getProductHistoryHandler,
  getProductPreviewHandler,
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
// Read-only review of one product record — the retrieval it came back from,
// the revision remarks, and where the units now sit. Managers get it too:
// reviewing a revised record is exactly what the role is for, and nothing
// here can change anything.
productsRouter.get(
  "/:productId/preview",
  authorize("admin", "manager"),
  getProductPreviewHandler,
);
productsRouter.get(
  "/:productId/history",
  authorize("admin", "manager"),
  getProductHistoryHandler,
);
productsRouter.delete("/:productId", authorize("admin"), deleteProductHandler);
