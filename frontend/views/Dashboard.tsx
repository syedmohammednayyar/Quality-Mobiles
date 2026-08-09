import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDashboardSummary, type DashboardSummary } from "../services/api";
import type { User } from "../types";
import "./Dashboard.css";

const money = (value: number) => `Rs ${Math.round(value || 0).toLocaleString()}`;
// [kpiKey, label, isMoney] — money KPIs are currency-formatted, the rest are counts.
const kpiLabels: Array<[string, string, boolean]> = [
  ["todaySales", "Today's Sales", false],
  ["todayRevenue", "Today's Revenue", true],
  ["productsSoldToday", "Products Sold Today", false],
  ["availableInventory", "Available Inventory", false],
  ["buybackInventory", "Buyback Inventory", false],
  ["underRepairBuybacks", "Under Repair Devices", false],
  ["totalCustomers", "Total Customers", false],
  ["lowStockProducts", "Low Stock Products", false],
  ["pendingPayments", "Pending Payments", true],
];
const lossKpiLabels: Array<[string, string, boolean]> = [["totalLoss", "Total Loss", true], ["lossTransactionCount", "Loss Bills", false], ["lossItemCount", "Loss Items", false], ["averageLoss", "Avg Loss", true]];

const Dashboard: React.FC<{ user: User }> = ({ user }) => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try { setLoading(true); setError(""); setSummary(await getDashboardSummary()); }
      catch (e) { setError(e instanceof Error ? e.message : "Failed to load dashboard"); }
      finally { setLoading(false); }
    })();
  }, []);

  const salesRows = useMemo(() => summary ? [["Today", summary.salesOverview.today], ["This Week", summary.salesOverview.week], ["This Month", summary.salesOverview.month]] : [], [summary]);
  const lossByStore = useMemo(() => (summary?.lossByStore || []).slice().sort((a, b) => b.lossAmount - a.lossAmount), [summary]);
  const maxStoreLoss = useMemo(() => Math.max(1, ...lossByStore.map((row) => row.lossAmount)), [lossByStore]);
  const quickLinks = user.role === "Admin" || user.role === "Manager"
    ? [["Inventory", "/inventory"], ["Sales", "/sales"], ["Buyback", "/buyback"], ["Reports", "/reports"]]
    : [["POS", "/pos"], ["Sales", "/sales"], ["Buyback", "/buyback"]];

  if (loading) return <div className="dashboard"><p className="dash-state">Loading dashboard...</p></div>;
  if (error || !summary) return <div className="dashboard"><p className="dash-state error">{error || "Dashboard unavailable"}</p></div>;

  return <div className="dashboard">
    <header className="module-header dash-header"><div><h1>{user.role === "Admin" ? "Business Dashboard" : "Store Dashboard"}</h1><p>Welcome back, {user.name}. Here is what needs attention today.</p></div><nav>{quickLinks.map(([label, path]) => <Link key={path} to={path}>{label}</Link>)}</nav></header>
    <section className="dash-kpis">{kpiLabels.map(([key, label, isMoney]) => <article key={key}><span>{label}</span><strong>{isMoney ? money(summary.kpis[key]) : Number(summary.kpis[key] || 0).toLocaleString()}</strong></article>)}</section>
    <section className="dash-kpis dash-kpis-loss">{lossKpiLabels.map(([key, label, isMoney]) => <article key={key} className="loss"><span>{label}</span><strong>{isMoney ? money(summary.kpis[key]) : Number(summary.kpis[key] || 0).toLocaleString()}</strong></article>)}</section>
    <section className="dash-grid two">
      <article className="dash-card"><h2>Sales Overview</h2><div className="sales-overview">{salesRows.map(([label, row]: any) => <div key={label}><span>{label}</span><strong>{row.sales} sales</strong><b>{money(row.revenue)}</b><small>{row.productsSold} products</small></div>)}</div></article>
      <article className="dash-card"><h2>Inventory Status</h2><div className="inventory-status-grid"><div><span>New Phones</span><strong>{summary.inventory.newPhones}</strong></div><div><span>Used Phones</span><strong>{summary.inventory.usedPhones}</strong></div><div><span>Low Stock</span><strong>{summary.inventory.lowStock}</strong></div><div><span>Transferred</span><strong>{summary.inventory.recentlyTransferred}</strong></div></div></article>
    </section>
    {user.role === "Admin" && (
      <section className="dash-grid bottom single">
        <article className="dash-card"><h2>Store Comparison</h2><ResponsiveContainer width="100%" height={230}><BarChart data={summary.storePerformance}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="store" /><YAxis /><Tooltip /><Bar dataKey="revenue" fill="#1677a6" /><Bar dataKey="inventoryValue" fill="#e3a226" /></BarChart></ResponsiveContainer></article>
      </section>
    )}
    <section className="dash-grid bottom single">
      <article className="dash-card">
        <div className="dash-card-head"><h2>Loss by Store</h2><Link to="/losses">View All</Link></div>
        <div className="loss-store-list">
          {lossByStore.length === 0 && <p className="dash-empty">No store loss data yet.</p>}
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
    {summary.alerts.length > 0 && <section className="dash-alerts">{summary.alerts.map((alert) => <article key={alert.type}><strong>{alert.type}</strong><span>{alert.count}</span><p>{alert.action}</p></article>)}</section>}
    <section className="dash-grid bottom single">
      <article className="dash-card table-card"><div className="dash-card-head"><h2>Recent Sales</h2><Link to="/sales">View All</Link></div><table><thead><tr><th>Job Number</th><th>Product</th><th>Customer</th><th>Store</th><th>Amount</th><th>Time</th></tr></thead><tbody>{summary.recentSales.map((sale) => <tr key={sale.id}><td>{sale.jobNumber}</td><td>{sale.product}</td><td>{sale.customer}</td><td>{sale.store}</td><td>{money(sale.amount)}</td><td>{new Date(sale.time).toLocaleTimeString()}</td></tr>)}</tbody></table></article>
    </section>
    <section className="dash-grid bottom single">
      <article className="dash-card table-card"><div className="dash-card-head"><h2>Recent Losses</h2><Link to="/losses">View All</Link></div><table><thead><tr><th>Bill</th><th>Product</th><th>Store</th><th>Employee</th><th>Cost</th><th>Sold</th><th>Loss</th><th>Reason</th><th>Time</th></tr></thead><tbody>
        {(summary.recentLosses || []).map((loss) => <tr key={loss.id} className="loss-row" onClick={() => navigate(`/losses?highlight=${loss.id}`)}><td>{loss.saleNo}</td><td>{loss.product}</td><td>{loss.store}</td><td>{loss.employee}</td><td>{money(loss.costBasis)}</td><td>{money(loss.soldAmount)}</td><td className="loss-amount">{money(loss.lossAmount)}</td><td>{loss.reason}</td><td>{new Date(loss.time).toLocaleTimeString()}</td></tr>)}
        {(!summary.recentLosses || summary.recentLosses.length === 0) && <tr><td colSpan={9} className="dash-empty">No losses found. Every recent sale met or beat its cost basis.</td></tr>}
      </tbody></table></article>
    </section>
  </div>;
};

export default Dashboard;
