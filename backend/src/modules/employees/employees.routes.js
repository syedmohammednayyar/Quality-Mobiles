import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createEmployeeHandler,
  deleteEmployeeHandler,
  listEmployeesHandler,
  updateEmployeeHandler,
} from "./employees.controller.js";

export const employeesRouter = Router();

employeesRouter.use(authenticate);

employeesRouter.get(
  "/",
  authorize("admin"),
  listEmployeesHandler,
);
employeesRouter.post("/", authorize("admin"), createEmployeeHandler);
employeesRouter.patch(
  "/:employeeId",
  authorize("admin"),
  updateEmployeeHandler,
);
employeesRouter.delete(
  "/:employeeId",
  authorize("admin"),
  deleteEmployeeHandler,
);
