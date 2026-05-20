import { getAdminReportOverview, streamReportPdf } from "./reports.service.js";
import { HttpError } from "../../utils/httpError.js";

function parseStoreIds(raw) {
  if (!raw) return [];
  return String(raw).split(",").map((x) => x.trim()).filter(Boolean);
}

export async function getAdminOverviewHandler(req, res, next) {
  try {
    if (!req.auth?.roles?.includes("admin")) throw new HttpError(403, "Admin only", "REPORT_ADMIN_ONLY");
    const payload = await getAdminReportOverview({
      quickRange: req.query.quickRange || "this_month",
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      storeIds: parseStoreIds(req.query.storeIds),
    });
    res.json({ success: true, data: payload });
  } catch (e) { next(e); }
}

export async function exportAdminPdfHandler(req, res, next) {
  try {
    if (!req.auth?.roles?.includes("admin")) throw new HttpError(403, "Admin only", "REPORT_ADMIN_ONLY");
    const payload = await getAdminReportOverview({
      quickRange: req.query.quickRange || "this_month",
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      storeIds: parseStoreIds(req.query.storeIds),
    });
    const label = payload.filters.storeIds?.length ? payload.filters.storeIds.join(", ") : "All 4 Stores";
    await streamReportPdf(res, payload, { username: req.auth.username, storeLabel: label });
  } catch (e) { next(e); }
}
