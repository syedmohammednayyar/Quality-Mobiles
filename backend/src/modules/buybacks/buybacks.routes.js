import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { applyStoreFilter, resolveStoreContext } from "../../middleware/storeScope.js";
import {
  createBuybackHandler,
  deleteBuybackHandler,
  listBuybacksHandler,
  updateBuybackHandler,
} from "./buybacks.controller.js";

export const buybacksRouter = Router();

buybacksRouter.use(authenticate);
buybacksRouter.use(resolveStoreContext);
buybacksRouter.use(applyStoreFilter);

buybacksRouter.get(
  "/",
  authorize("admin", "manager", "employee"),
  listBuybacksHandler,
);
buybacksRouter.post(
  "/",
  authorize("admin", "manager", "employee"),
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
