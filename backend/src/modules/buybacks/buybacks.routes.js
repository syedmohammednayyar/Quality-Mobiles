import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createBuybackHandler,
  deleteBuybackHandler,
  listBuybacksHandler,
  updateBuybackHandler,
} from "./buybacks.controller.js";

export const buybacksRouter = Router();

buybacksRouter.use(authenticate);

buybacksRouter.get(
  "/",
  authorize("admin", "manager", "inventory_manager"),
  listBuybacksHandler,
);
buybacksRouter.post(
  "/",
  authorize("admin", "manager"),
  createBuybackHandler,
);
buybacksRouter.patch(
  "/:buybackId",
  authorize("admin", "manager"),
  updateBuybackHandler,
);
buybacksRouter.delete(
  "/:buybackId",
  authorize("admin"),
  deleteBuybackHandler,
);
