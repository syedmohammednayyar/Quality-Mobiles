import { getAdminReportOverview } from "./reports.service.js";

function parseStoreIds(raw) {
  if (!raw) return [];
  return String(raw).split(",").map((x) => x.trim()).filter(Boolean);
}

function scopedStoreIds(req) {
  const requested = parseStoreIds(req.query.storeIds);
  if (req.auth?.roles?.includes("admin")) return requested;
  return req.auth?.store_id ? [String(req.auth.store_id)] : [];
}

export async function getAdminOverviewHandler(req, res, next) {
  try {
    const payload = await getAdminReportOverview({
      quickRange: req.query.quickRange || "this_month",
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      month: req.query.month,
      year: req.query.year,
      storeIds: scopedStoreIds(req),
    });
    res.json({ success: true, data: payload });
  } catch (e) { next(e); }
}

