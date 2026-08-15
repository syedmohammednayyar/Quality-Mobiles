import mongoose from 'mongoose';
import { HttpError } from '../../utils/httpError.js';
import { getDashboardSummary, resolveDateRange } from './dashboard.service.js';

const ALL_STORES = 'ALL';

const isAllStores = (value) =>
  value === undefined || value === null || value === '' || String(value).toUpperCase() === ALL_STORES;

/**
 * Decide which store the dashboard may read, from the request rather than from
 * the caller's claim. Admins may pick any store (or the consolidated view);
 * everyone else is pinned to the store their token was issued for, so editing
 * `?storeId=` in the address bar cannot reach another branch's data.
 */
function resolveRequestedStore(req) {
  const requested = req.query.storeId ?? req.headers['x-store-id'];
  const admin = Boolean(req.auth?.roles?.includes('admin'));

  if (!admin) {
    // resolveStoreContext has already rejected a mismatched explicit request;
    // anything left resolves to the caller's own assigned store.
    const assigned = req.auth?.store_id ? String(req.auth.store_id) : null;
    if (!assigned) throw new HttpError(403, 'No store assigned to this account', 'STORE_ASSIGNMENT_REQUIRED');
    return assigned;
  }

  if (isAllStores(requested)) return null;

  const storeId = String(requested);
  if (!mongoose.Types.ObjectId.isValid(storeId)) {
    throw new HttpError(400, 'Invalid store selection', 'STORE_INVALID_ID');
  }
  return storeId;
}

export async function stockMetricsHandler(req, res, next) {
  try {
    const storeId = resolveRequestedStore(req);
    const range = resolveDateRange({
      rangeKey: req.query.range,
      fromDate: req.query.fromDate,
      toDate:   req.query.toDate,
    });

    const metrics = await getDashboardSummary({
      storeId,
      from:       range.from,
      to:         range.to,
      rangeKey:   range.rangeKey,
      rangeLabel: range.label,
    });
    res.status(200).json(metrics);
  } catch (error) {
    next(error);
  }
}
