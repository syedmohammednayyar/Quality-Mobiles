import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { applyStoreFilter, resolveStoreContext } from "../../middleware/storeScope.js";
import {
  exportLossesHandler,
  getLossByEmployeeHandler,
  getLossByIdHandler,
  getLossByProductHandler,
  getLossByReasonHandler,
  getLossByStoreHandler,
  getLossSummaryHandler,
  getLossTrendHandler,
  listLossesHandler,
} from "./losses.controller.js";

export const lossesRouter = Router();

lossesRouter.use(authenticate);
lossesRouter.use(resolveStoreContext);
lossesRouter.use(applyStoreFilter);
lossesRouter.use(authorize("admin", "manager"));

lossesRouter.get("/", listLossesHandler);
lossesRouter.get("/summary", getLossSummaryHandler);
lossesRouter.get("/by-store", getLossByStoreHandler);
lossesRouter.get("/by-employee", getLossByEmployeeHandler);
lossesRouter.get("/by-product", getLossByProductHandler);
lossesRouter.get("/by-reason", getLossByReasonHandler);
lossesRouter.get("/trend", getLossTrendHandler);
lossesRouter.get("/export", exportLossesHandler);
lossesRouter.get("/:id", getLossByIdHandler);
