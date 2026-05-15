import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createChangeRequestHandler,
  listChangeRequestsHandler,
  getChangeRequestByIdHandler,
  approveChangeRequestHandler,
  rejectChangeRequestHandler,
  getPendingCountHandler,
} from "./changeRequests.controller.js";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create a new change request (any authenticated user)
router.post(
  "/",
  authorize("admin", "manager", "cashier"),
  createChangeRequestHandler,
);

// List change requests
router.get("/", authorize("admin", "manager"), listChangeRequestsHandler);

// Get pending count (for notifications badge)
router.get(
  "/pending-count",
  authorize("admin", "manager"),
  getPendingCountHandler,
);

// Get single change request by ID
router.get("/:id", authorize("admin", "manager"), getChangeRequestByIdHandler);

// Approve a change request (admin only)
router.post("/:id/approve", authorize("admin"), approveChangeRequestHandler);

// Reject a change request (admin only)
router.post("/:id/reject", authorize("admin"), rejectChangeRequestHandler);

export default router;
