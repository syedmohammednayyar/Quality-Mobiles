import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  listManagedStoresHandler,
  resetCredentialPasswordHandler,
} from "./employeeAccess.controller.js";

export const employeeAccessRouter = Router();

employeeAccessRouter.use(authenticate);
employeeAccessRouter.use(authorize("admin", "manager"));

employeeAccessRouter.post("/credentials/:employeeId/reset-password", authorize("admin"), resetCredentialPasswordHandler);
employeeAccessRouter.get("/stores", listManagedStoresHandler);
