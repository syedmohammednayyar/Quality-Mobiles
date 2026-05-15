import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  listCredentialsHandler,
  listManagedStoresHandler,
  resetCredentialPasswordHandler,
  updateCredentialStatusHandler,
} from "./employeeAccess.controller.js";

export const employeeAccessRouter = Router();

employeeAccessRouter.use(authenticate);
employeeAccessRouter.use(authorize("admin", "manager"));

employeeAccessRouter.get("/credentials", listCredentialsHandler);
employeeAccessRouter.patch("/credentials/:employeeId/status", updateCredentialStatusHandler);
employeeAccessRouter.post("/credentials/:employeeId/reset-password", authorize("admin"), resetCredentialPasswordHandler);
employeeAccessRouter.get("/stores", listManagedStoresHandler);
