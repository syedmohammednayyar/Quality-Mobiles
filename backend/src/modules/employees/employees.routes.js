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
  authorize("admin", "manager"),
  listEmployeesHandler,
);
employeesRouter.post("/", authorize("admin", "manager"), createEmployeeHandler);
employeesRouter.patch(
  "/:employeeId",
  authorize("admin", "manager"),
  updateEmployeeHandler,
);
employeesRouter.delete("/:employeeId", authorize("admin"), deleteEmployeeHandler);
