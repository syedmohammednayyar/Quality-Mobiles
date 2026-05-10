import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createSaleHandler,
  deleteSaleHandler,
  getSaleByIdHandler,
  listSalesHandler,
  updateSaleHandler,
} from "./sales.controller.js";

export const salesRouter = Router();

salesRouter.use(authenticate);

salesRouter.get(
  "/",
  authorize("admin", "manager", "cashier", "inventory_manager"),
  listSalesHandler,
);

salesRouter.post(
  "/",
  authorize("admin", "manager", "cashier"),
  createSaleHandler,
);

salesRouter.get(
  "/:saleId",
  authorize("admin", "manager", "cashier", "inventory_manager"),
  getSaleByIdHandler,
);

salesRouter.patch(
  "/:saleId",
  authorize("admin", "manager", "cashier"),
  updateSaleHandler,
);

salesRouter.delete(
  "/:saleId",
  authorize("admin", "manager", "cashier"),
  deleteSaleHandler,
);
