import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import * as jobNumberController from "./jobNumber.controller.js";
import * as icNumberController from "./icNumber.controller.js";
import * as giftController from "./gift.controller.js";
import * as priceChangeController from "./priceChange.controller.js";
import * as exportController from "./export.controller.js";
import * as cashVisibilityController from "./cashVisibility.controller.js";

const router = Router();

// =============================================
// JOB NUMBER ENDPOINTS
// =============================================

/**
 * Link job number to product
 * POST /api/v1/workflows/job-numbers/:productId/link
 */
router.post(
  "/job-numbers/:productId/link",
  authenticate,
  authorize("admin"),
  jobNumberController.linkJobNumberHandler,
);

/**
 * Get product by job number
 * GET /api/v1/workflows/job-numbers/:jobNumber
 */
router.get(
  "/job-numbers/:jobNumber",
  authenticate,
  jobNumberController.getProductByJobNumberHandler,
);

/**
 * Search inventory by job number
 * GET /api/v1/workflows/inventory/search?jobNumber=JOB-001
 */
router.get(
  "/inventory/search",
  authenticate,
  jobNumberController.searchInventoryByJobNumberHandler,
);

/**
 * Unlink job number from product
 * DELETE /api/v1/workflows/job-numbers/:productId
 */
router.delete(
  "/job-numbers/:productId",
  authenticate,
  authorize("admin"),
  jobNumberController.unlinkJobNumberHandler,
);

// =============================================
// IC NUMBER ENDPOINTS
// =============================================

/**
 * Capture IC number during sales
 * POST /api/v1/workflows/ic-numbers/capture
 */
router.post(
  "/ic-numbers/capture",
  authenticate,
  authorize("cashier", "manager", "admin"),
  icNumberController.captureIcNumberHandler,
);

/**
 * Request IC number change
 * POST /api/v1/workflows/ic-numbers/request-change
 */
router.post(
  "/ic-numbers/request-change",
  authenticate,
  authorize("manager", "admin"),
  icNumberController.requestIcNumberChangeHandler,
);

/**
 * Check if IC number is locked
 * GET /api/v1/workflows/ic-numbers/:entityType/:entityId/locked
 */
router.get(
  "/ic-numbers/:entityType/:entityId/locked",
  authenticate,
  icNumberController.checkIcNumberLockedHandler,
);

// =============================================
// GIFT ENDPOINTS
// =============================================

/**
 * Create gift product
 * POST /api/v1/workflows/gifts/products
 */
router.post(
  "/gifts/products",
  authenticate,
  authorize("admin", "manager"),
  giftController.createGiftProductHandler,
);

/**
 * Issue gift from inventory
 * POST /api/v1/workflows/gifts/issue
 */
router.post(
  "/gifts/issue",
  authenticate,
  authorize("manager", "admin"),
  giftController.issueGiftHandler,
);

/**
 * Receive gift back
 * POST /api/v1/workflows/gifts/receive
 */
router.post(
  "/gifts/receive",
  authenticate,
  authorize("manager", "admin"),
  giftController.receiveGiftHandler,
);

/**
 * List gift inventory
 * GET /api/v1/workflows/gifts/inventory/:storeId
 */
router.get(
  "/gifts/inventory/:storeId",
  authenticate,
  giftController.listGiftInventoryHandler,
);

/**
 * Get gift transaction history
 * GET /api/v1/workflows/gifts/transactions/:storeId?productId=123
 */
router.get(
  "/gifts/transactions/:storeId",
  authenticate,
  giftController.getGiftTransactionHistoryHandler,
);

// =============================================
// PRICE CHANGE ENDPOINTS
// =============================================

/**
 * Request price change
 * POST /api/v1/workflows/price-changes/request
 */
router.post(
  "/price-changes/request",
  authenticate,
  authorize("manager", "admin"),
  priceChangeController.requestPriceChangeHandler,
);

/**
 * List pending price changes
 * GET /api/v1/workflows/price-changes/pending
 */
router.get(
  "/price-changes/pending",
  authenticate,
  authorize("admin"),
  priceChangeController.listPendingPriceChangesHandler,
);

/**
 * Approve price change
 * POST /api/v1/workflows/price-changes/:id/approve
 */
router.post(
  "/price-changes/:id/approve",
  authenticate,
  authorize("admin"),
  priceChangeController.approvePriceChangeHandler,
);

/**
 * Reject price change
 * POST /api/v1/workflows/price-changes/:id/reject
 */
router.post(
  "/price-changes/:id/reject",
  authenticate,
  authorize("admin"),
  priceChangeController.rejectPriceChangeHandler,
);

// =============================================
// EXPORT ENDPOINTS
// =============================================

/**
 * Export sales to CSV
 * GET /api/v1/workflows/exports/sales/csv?storeId=1&fromDate=2026-04-01&toDate=2026-04-25
 */
router.get(
  "/exports/sales/csv",
  authenticate,
  authorize("manager", "admin"),
  exportController.exportSalesCSVHandler,
);

/**
 * Export inventory to CSV
 * GET /api/v1/workflows/exports/inventory/csv?storeId=1
 */
router.get(
  "/exports/inventory/csv",
  authenticate,
  authorize("manager", "admin"),
  exportController.exportInventoryCSVHandler,
);

/**
 * Export inventory to PDF
 * GET /api/v1/workflows/exports/inventory/pdf?storeId=1
 */
router.get(
  "/exports/inventory/pdf",
  authenticate,
  authorize("manager", "admin"),
  exportController.exportInventoryPDFHandler,
);

/**
 * Export change requests to CSV (audit trail)
 * GET /api/v1/workflows/exports/change-requests/csv?fromDate=2026-04-01&toDate=2026-04-25
 */
router.get(
  "/exports/change-requests/csv",
  authenticate,
  authorize("admin"),
  exportController.exportChangeRequestsCSVHandler,
);

/**
 * Get export history
 * GET /api/v1/workflows/exports/history
 */
router.get(
  "/exports/history",
  authenticate,
  authorize("admin"),
  exportController.getExportHistoryHandler,
);

// =============================================
// CASH VISIBILITY ENDPOINTS
// =============================================

/**
 * Check cash visibility for a date
 * POST /api/v1/workflows/cash-visibility/check
 */
router.post(
  "/cash-visibility/check",
  authenticate,
  cashVisibilityController.checkCashVisibilityHandler,
);

/**
 * Validate T+1 access for a specific date
 * GET /api/v1/workflows/cash-visibility/validate?date=2026-04-25&overrideT1=false
 */
router.get(
  "/cash-visibility/validate",
  authenticate,
  cashVisibilityController.validateT1AccessHandler,
);

export default router;
