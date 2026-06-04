import express from 'express';
import { stockMetricsHandler } from './dashboard.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

export const dashboardRouter = express.Router();

dashboardRouter.get('/summary', authenticate, authorize('admin', 'manager'), stockMetricsHandler);

export default dashboardRouter;
