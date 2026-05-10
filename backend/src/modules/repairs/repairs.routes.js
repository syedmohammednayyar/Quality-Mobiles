import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createRepairHandler,
  deleteRepairHandler,
  listRepairsHandler,
  updateRepairHandler,
} from "./repairs.controller.js";

export const repairsRouter = Router();

repairsRouter.use(authenticate);

repairsRouter.get(
  "/",
  authorize("admin", "manager", "inventory_manager"),
  listRepairsHandler,
);
repairsRouter.post(
  "/",
  authorize("admin", "manager"),
  createRepairHandler,
);
repairsRouter.patch(
  "/:repairId",
  authorize("admin", "manager"),
  updateRepairHandler,
);
repairsRouter.delete(
  "/:repairId",
  authorize("admin"),
  deleteRepairHandler,
);
