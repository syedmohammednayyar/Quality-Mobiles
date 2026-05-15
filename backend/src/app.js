import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";
import { applyStoreFilter, resolveStoreContext } from "./middleware/storeScope.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { buybacksRouter } from "./modules/buybacks/buybacks.routes.js";
import { customersRouter } from "./modules/customers/customers.routes.js";
import { employeesRouter } from "./modules/employees/employees.routes.js";
import { expensesRouter } from "./modules/expenses/expenses.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { paymentsRouter } from "./modules/payments/payments.routes.js";
import { productsRouter } from "./modules/products/products.routes.js";
import { repairsRouter } from "./modules/repairs/repairs.routes.js";
import { salesRouter } from "./modules/sales/sales.routes.js";
import { storesRouter } from "./modules/stores/stores.routes.js";
import workflowsRouter from "./modules/workflows/workflows.routes.js";
import changeRequestsRouter from "./modules/changeRequests/changeRequests.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { employeeAccessRouter } from "./modules/employeeAccess/employeeAccess.routes.js";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(resolveStoreContext);
app.use(applyStoreFilter);

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/stores", storesRouter);
app.use("/api/v1/customers", customersRouter);
app.use("/api/v1/employees", employeesRouter);
app.use("/api/v1/expenses", expensesRouter);
app.use("/api/v1/payments", paymentsRouter);
app.use("/api/v1/buybacks", buybacksRouter);
app.use("/api/v1/repairs", repairsRouter);
app.use("/api/v1/products", productsRouter);
app.use("/api/v1/inventory", inventoryRouter);
app.use("/api/v1/sales", salesRouter);
app.use("/api/v1/workflows", workflowsRouter);
app.use("/api/v1/change-requests", changeRequestsRouter);
app.use("/api/v1/reports", reportsRouter);
app.use("/api/v1/employee-access", employeeAccessRouter);

app.use(errorHandler);
