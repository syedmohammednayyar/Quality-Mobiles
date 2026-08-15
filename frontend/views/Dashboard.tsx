import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getDashboardSummary, type DashboardRangeKey, type DashboardSummary } from "../services/api";
import { useStoreSelection } from "../context/StoreSelectionContext";
import type { User } from "../types";
import "./Dashboard.css";

const money = (value: number) => `Rs ${Math.round(value || 0).toLocaleString()}`;
const count = (value: number) => Number(value || 0).toLocaleString();

const RANGES: Array<[DashboardRangeKey, string]> = [
  ["today", "Today"],
  ["week", "This Week"],
  ["month", "This Month"],
  ["year", "This Year"],
  ["custom", "Custom"],
];

// [kpiKey, label, isMoney] — money KPIs are currency-formatted, the rest are counts.
// The first block moves with the selected period; the second is point-in-time stock.
const periodKpis: Array<[string, string, boolean]> = [
  ["periodSales", "Sales / Orders", false],
  ["periodNetRevenue", "Revenue", true],
  ["productsSoldPeriod", "Products Sold", false],
  ["periodAdjustmentsCount", "Price Adjustments", false],
];
const stockKpis: Array<[string, string, boolean]> = [
  ["availableInventory", "Available Inventory", false],
  ["buybackInventory", "Buyback Inventory", false],
  ["underRepairBuybacks", "Under Repair Devices", false],
  ["lowStockProducts", "Low Stock Products", false],
  ["totalCustomers", "Total Customers", false],
  ["pendingPayments", "Pending Payments", true],
];
const lossKpiLabels: Array<[string, string, boolean]> = [
  ["totalLoss", "Total Loss", true],
  ["lossTransactionCount", "Loss Bills", false],
  ["lossItemCount", "Loss Items", false],
  ["averageLoss", "Avg Loss", true],
];

const BREAKDOWN_COLORS = ["#1677a6", "#e3a226", "#3f9d6a", "#a4548f", "#7a6ff0", "#c4593c"];

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

const Dashboard: React.FC<{ user: User }> = ({ user }) => {
  const navigate = useNavigate();
  const { selectedStoreId, selectedStoreName, isAllStores } = useStoreSelection();

  const [range, setRange] = useState<DashboardRangeKey>("today");
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  // Monotonic id of the newest request. A response whose id is no longer the
  // newest belongs to a store the admin has already moved past, so it is
  // dropped instead of being painted over the current selection.
  const latestRequest = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;

    // Drop the previous store's numbers immediately — a skeleton is honest,
    // stale figures under a new store name are not.
    setSummary(null);
    setLoading(true);
    setError("");

    void (async () => {
      try {
        const data = await getDashboardSummary(
          { storeId: selectedStoreId, range, fromDate, toDate },
          controller.signal,
        );
        if (requestId !== latestRequest.current) return;
        setSummary(data);
      } catch (e) {
        if (controller.signal.aborted || (e as Error)?.name === "AbortError") return;
        if (requestId !== latestRequest.current) return;
        setSummary(null);
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        if (requestId === latestRequest.current) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [selectedStoreId, range, fromDate, toDate, reloadToken]);

  // Label the view from what the server actually scoped to, never from local
  // state alone, so the heading can never disagree with the numbers below it.
  const scopeName = summary?.scope?.storeName || selectedStoreName;
  const scopeRange = summary?.scope?.rangeLabel || RANGES.find(([key]) => key === range)?.[1] || "";

  const salesRows = useMemo(() => summary
    ? ([["Selected Period", summary.salesOverview.period], ["Today", summary.salesOverview.today], ["This Week", summary.salesOverview.week], ["This Month", summary.salesOverview.month]] as const)
    : [], [summary]);
  const lossByStore = useMemo(() => (summary?.lossByStore || []).slice().sort((a, b) => b.lossAmount - a.lossAmount), [summary]);
  const maxStoreLoss = useMemo(() => Math.max(1, ...lossByStore.map((row) => row.lossAmount)), [lossByStore]);
  const trendHasSales = useMemo(() => (summary?.salesTrend || []).some((point) => point.sales > 0), [summary]);

  const quickLinks = user.role === "Admin" || user.role === "Manager"
    ? [["Inventory", "/inventory"], ["Sales", "/sales"], ["Buyback", "/buyback"], ["Reports", "/reports"]]
    : [["POS", "/pos"], ["Sales", "/sales"], ["Buyback", "/buyback"]];

  const filterBar = (
    <section className="dash-filters">
      <div className="dash-scope">
        <span>Showing data for</span>
        <strong>{scopeName}</strong>
        <em>{scopeRange}</em>
      </div>
      <div className="dash-range">
        {RANGES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={range === key ? "active" : ""}
            onClick={() => setRange(key)}
          >{label}</button>
        ))}
        {range === "custom" && (
          <span className="dash-range-dates">
            <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} />
            <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
          </span>
        )}
      </div>
    </section>
  );

  const header = (
    <header className="module-header dash-header">
      <div>
        <h1>{user.role === "Admin" ? "Business Dashboard" : "Store Dashboard"}</h1>
        <p>Welcome back, {user.name}. Here is what needs attention today.</p>
      </div>
      <nav>{quickLinks.map(([label, path]) => <Link key={path} to={path}>{label}</Link>)}</nav>
    </header>
  );

  if (loading) {
    return <div className="dashboard">
      {header}
      {filterBar}
      <p className="dash-state">Loading {selectedStoreName} data...</p>
      <section className="dash-kpis">{periodKpis.map(([key]) => <article key={key} className="dash-skeleton" />)}</section>
      <section className="dash-grid two"><article className="dash-card dash-skeleton tall" /><article className="dash-card dash-skeleton tall" /></section>
    </div>;
  }

  if (error || !summary) {
    return <div className="dashboard">
      {header}
      {filterBar}
      <p className="dash-state error">
        Unable to load {selectedStoreName} dashboard data. {error || "Please try again."}
      </p>
      <button className="btn btn-secondary dash-retry" onClick={() => setReloadToken((token) => token + 1)}>Try again</button>
    </div>;
  }

  return <div className="dashboard">
    {header}
    {filterBar}

    <section className="dash-kpis">
      {periodKpis.map(([key, label, isMoney]) => (
        <article key={key}>
          <span>{label}</span>
          <strong>{isMoney ? money(summary.kpis[key]) : count(summary.kpis[key])}</strong>
          <small className="dash-kpi-note">{scopeRange}</small>
        </article>
      ))}
    </section>

    <section className="dash-kpis">
      {stockKpis.map(([key, label, isMoney]) => (
        <article key={key}><span>{label}</span><strong>{isMoney ? money(summary.kpis[key]) : count(summary.kpis[key])}</strong></article>
      ))}
    </section>

    <section className="dash-kpis dash-kpis-loss">
      {lossKpiLabels.map(([key, label, isMoney]) => (
        <article key={key} className="loss"><span>{label}</span><strong>{isMoney ? money(summary.kpis[key]) : count(summary.kpis[key])}</strong></article>
      ))}
    </section>

    <section className="dash-grid bottom single">
      <article className="dash-card">
        <div className="dash-card-head"><h2>Sales Trend - {scopeName}</h2><span className="dash-card-sub">{scopeRange}</span></div>
        {trendHasSales ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={summary.salesTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(value: number) => money(value)} />
              <Line type="monotone" dataKey="revenue" stroke="#1677a6" strokeWidth={2} dot={false} name="Revenue" />
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="dash-empty">No sales data available for {scopeName} in this period.</p>}
      </article>
    </section>

    <section className="dash-grid two">
      <article className="dash-card">
        <h2>Sales Overview</h2>
        <div className="sales-overview four">
          {salesRows.map(([label, row]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{row.sales} sales</strong>
              <b>{money(row.revenue)}</b>
              <small>{row.productsSold} products</small>
            </div>
          ))}
        </div>
      </article>
      <article className="dash-card">
        <h2>Inventory Status</h2>
        <div className="inventory-status-grid">
          <div><span>New Phones</span><strong>{count(summary.inventory.newPhones)}</strong></div>
          <div><span>Used Phones</span><strong>{count(summary.inventory.usedPhones)}</strong></div>
          <div><span>Low Stock</span><strong>{count(summary.inventory.lowStock)}</strong></div>
          <div><span>Transferred</span><strong>{count(summary.inventory.recentlyTransferred)}</strong></div>
        </div>
      </article>
    </section>

    <section className="dash-grid two">
      <article className="dash-card">
        <div className="dash-card-head"><h2>Top Products</h2><span className="dash-card-sub">{scopeName}</span></div>
        {summary.topProducts.length === 0
          ? <p className="dash-empty">No products sold at {scopeName} in this period.</p>
          : <div className="top-product-list">
              {summary.topProducts.map((product) => (
                <div key={product.productId} className="top-product-row">
                  <span className="top-product-name">{product.name}{product.brand ? ` - ${product.brand}` : ""}</span>
                  <span className="top-product-qty">{count(product.quantity)} sold</span>
                  <span className="top-product-amount">{money(product.revenue)}</span>
                </div>
              ))}
            </div>}
      </article>
      <article className="dash-card">
        <div className="dash-card-head"><h2>Revenue Breakdown</h2><span className="dash-card-sub">{scopeName}</span></div>
        {summary.revenueBreakdown.length === 0
          ? <p className="dash-empty">No revenue recorded for {scopeName} in this period.</p>
          : <div className="revenue-breakdown">
              {summary.revenueBreakdown.map((slice, index) => (
                <div key={slice.key} className="revenue-row">
                  <span className="revenue-label">{slice.label}</span>
                  <span className="revenue-bar-track">
                    <span className="revenue-bar-fill" style={{ width: `${slice.percent}%`, background: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length] }} />
                  </span>
                  <span className="revenue-amount">{money(slice.amount)}</span>
                  <span className="revenue-percent">{slice.percent}%</span>
                </div>
              ))}
            </div>}
      </article>
    </section>

    {user.role === "Admin" && (
      <section className="dash-grid bottom single">
        <article className="dash-card">
          {/* With one store selected there is nothing to compare — showing every
              store's bars here would read as if they belonged to that store. */}
          <div className="dash-card-head">
            <h2>{isAllStores ? "Store Comparison" : `${scopeName} Performance`}</h2>
            <span className="dash-card-sub">{scopeRange}</span>
          </div>
          {summary.storePerformance.length === 0
            ? <p className="dash-empty">No store performance data for this period.</p>
            : isAllStores
              ? <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={summary.storePerformance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="store" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => money(value)} />
                    <Bar dataKey="revenue" fill="#1677a6" name="Revenue" />
                    <Bar dataKey="inventoryValue" fill="#e3a226" name="Inventory Value" />
                  </BarChart>
                </ResponsiveContainer>
              : <div className="single-store-perf">
                  {summary.storePerformance.map((row) => (
                    <React.Fragment key={row.storeId}>
                      <div><span>Revenue</span><strong>{money(row.revenue)}</strong></div>
                      <div><span>Sales</span><strong>{count(row.sales)}</strong></div>
                      <div><span>Inventory Value</span><strong>{money(row.inventoryValue)}</strong></div>
                      <div><span>Loss</span><strong className="loss-amount">{money(row.lossAmount || 0)}</strong></div>
                    </React.Fragment>
                  ))}
                </div>}
        </article>
      </section>
    )}

    <section className="dash-grid bottom single">
      <article className="dash-card">
        <div className="dash-card-head"><h2>Loss by Store</h2><Link to="/losses">View All</Link></div>
        <div className="loss-store-list">
          {lossByStore.length === 0 && <p className="dash-empty">No store loss data for {scopeName} in this period.</p>}
          {lossByStore.map((row) => (
            <div key={row.storeId} className="loss-store-row" onClick={() => navigate(`/losses?storeId=${row.storeId}`)}>
              <span className="loss-store-name">{row.storeName}</span>
              <span className="loss-store-bar-track"><span className="loss-store-bar-fill" style={{ width: `${Math.round((row.lossAmount / maxStoreLoss) * 100)}%` }} /></span>
              <span className="loss-store-amount">{money(row.lossAmount)}</span>
            </div>
          ))}
        </div>
      </article>
    </section>

    {summary.alerts.length > 0 && (
      <section className="dash-alerts">
        {summary.alerts.map((alert) => <article key={alert.type}><strong>{alert.type}</strong><span>{alert.count}</span><p>{alert.action}</p></article>)}
      </section>
    )}

    <section className="dash-grid bottom single">
      <article className="dash-card table-card">
        <div className="dash-card-head"><h2>Inventory Alerts - {scopeName}</h2><Link to="/inventory">View All</Link></div>
        <table>
          <thead><tr><th>Product</th><th>SKU</th><th>Store</th><th>On Hand</th><th>Minimum</th><th>Status</th></tr></thead>
          <tbody>
            {summary.inventoryAlerts.map((alert) => (
              <tr key={alert.id}>
                <td>{alert.product}</td>
                <td>{alert.sku}</td>
                <td>{alert.store}</td>
                <td>{count(alert.quantity)}</td>
                <td>{count(alert.minStockLevel)}</td>
                <td className={alert.severity === "out_of_stock" ? "loss-amount" : ""}>{alert.severity === "out_of_stock" ? "Out of stock" : "Low stock"}</td>
              </tr>
            ))}
            {summary.inventoryAlerts.length === 0 && <tr><td colSpan={6} className="dash-empty">No inventory records need attention for {scopeName}.</td></tr>}
          </tbody>
        </table>
      </article>
    </section>

    <section className="dash-grid bottom single">
      <article className="dash-card table-card">
        <div className="dash-card-head"><h2>Recent Sales - {scopeName}</h2><Link to="/sales">View All</Link></div>
        <table>
          <thead><tr><th>Job Number</th><th>Product</th><th>Customer</th><th>Store</th><th>Salesman</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
          <tbody>
            {summary.recentSales.map((sale) => (
              <tr key={sale.id}>
                <td>{sale.jobNumber}</td>
                <td>{sale.product}</td>
                <td>{sale.customer}</td>
                <td>{sale.store}</td>
                <td>{sale.salesman || "-"}</td>
                <td>{money(sale.amount)}</td>
                <td>{sale.status || "-"}</td>
                <td>{new Date(sale.time).toLocaleString()}</td>
              </tr>
            ))}
            {summary.recentSales.length === 0 && <tr><td colSpan={8} className="dash-empty">No sales data available for {scopeName} in this period.</td></tr>}
          </tbody>
        </table>
      </article>
    </section>

    <section className="dash-grid bottom single">
      <article className="dash-card table-card">
        <div className="dash-card-head"><h2>Recent Losses - {scopeName}</h2><Link to="/losses">View All</Link></div>
        <table>
          <thead><tr><th>Bill</th><th>Product</th><th>Store</th><th>Employee</th><th>Cost</th><th>Sold</th><th>Loss</th><th>Reason</th><th>Time</th></tr></thead>
          <tbody>
            {(summary.recentLosses || []).map((loss) => (
              <tr key={loss.id} className="loss-row" onClick={() => navigate(`/losses?highlight=${loss.id}`)}>
                <td>{loss.saleNo}</td><td>{loss.product}</td><td>{loss.store}</td><td>{loss.employee}</td>
                <td>{money(loss.costBasis)}</td><td>{money(loss.soldAmount)}</td>
                <td className="loss-amount">{money(loss.lossAmount)}</td><td>{loss.reason}</td>
                <td>{new Date(loss.time).toLocaleString()}</td>
              </tr>
            ))}
            {(!summary.recentLosses || summary.recentLosses.length === 0) && (
              <tr><td colSpan={9} className="dash-empty">No losses found for {scopeName} in this period.</td></tr>
            )}
          </tbody>
        </table>
      </article>
    </section>
  </div>;
};

export default Dashboard;
