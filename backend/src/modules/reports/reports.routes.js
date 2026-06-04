import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { exportAdminPdfHandler, getAdminOverviewHandler } from "./reports.controller.js";

export const reportsRouter = Router();
reportsRouter.use(authenticate);
reportsRouter.get("/admin/overview", authorize("admin", "manager"), getAdminOverviewHandler);
reportsRouter.get("/admin/export/pdf", authorize("admin", "manager"), exportAdminPdfHandler);
