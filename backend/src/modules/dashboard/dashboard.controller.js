import { getDashboardSummary } from './dashboard.service.js';

export async function stockMetricsHandler(req, res, next) {
  try {
    const storeId = req.auth && req.auth.store_id ? req.auth.store_id : undefined;
    const metrics = await getDashboardSummary(storeId);
    res.status(200).json(metrics);
  } catch (error) {
    next(error);
  }
}
