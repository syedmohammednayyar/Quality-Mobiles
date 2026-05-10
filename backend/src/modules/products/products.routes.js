import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createProductHandler,
  deleteProductHandler,
  listProductsHandler,
  updateProductHandler,
} from "./products.controller.js";

export const productsRouter = Router();

productsRouter.use(authenticate);

productsRouter.get(
  "/",
  authorize("admin", "manager", "cashier", "inventory_manager"),
  listProductsHandler,
);
productsRouter.post(
  "/",
  authorize("admin"),
  createProductHandler,
);
productsRouter.patch(
  "/:productId",
  authorize("admin"),
  updateProductHandler,
);
productsRouter.delete("/:productId", authorize("admin"), deleteProductHandler);
