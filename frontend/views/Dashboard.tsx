import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDashboardSummary, type DashboardSummary } from "../services/api";
import type { User } from "../types";
import "./Dashboard.css";

const money = (value: number) => `Rs ${Math.round(value || 0).toLocaleString()}`;
const kpiLabels: Array<[string, string]> = [["todaySales", "Today's Sales"], ["todayRevenue", "Today's Revenue"], ["productsSoldToday", "Products Sold Today"], ["availableInventory", "Available Inventory"], ["buybackInventory", "Buyback Inventory"], ["totalCustomers", "Total Customers"], ["lowStockProducts", "Low Stock Products"], ["pendingTransfers", "Pending Transfers"]];

const Dashboard: React.FC<{ user: User }> = ({ user }) => {
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
  const quickLinks = user.role === "Admin" || user.role === "Manager"
    ? [["Inventory", "/inventory"], ["Sales", "/sales"], ["Buyback", "/buyback"], ["Reports", "/reports"]]
    : [["POS", "/pos"], ["Sales", "/sales"], ["Buyback", "/buyback"]];

  if (loading) return <div className="dashboard"><p className="dash-state">Loading dashboard...</p></div>;
  if (error || !summary) return <div className="dashboard"><p className="dash-state error">{error || "Dashboard unavailable"}</p></div>;

  return <div className="dashboard">
    <header className="dash-header"><div><h1>{user.role === "Admin" ? "Business Dashboard" : "Store Dashboard"}</h1><p>Welcome back, {user.name}. Here is what needs attention today.</p></div><nav>{quickLinks.map(([label, path]) => <Link key={path} to={path}>{label}</Link>)}</nav></header>
    <section className="dash-kpis">{kpiLabels.map(([key, label]) => <article key={key}><span>{label}</span><strong>{/Revenue/i.test(label) ? money(summary.kpis[key]) : Number(summary.kpis[key] || 0).toLocaleString()}</strong></article>)}</section>
    <section className="dash-grid two">
      <article className="dash-card"><h2>Sales Overview</h2><div className="sales-overview">{salesRows.map(([label, row]: any) => <div key={label}><span>{label}</span><strong>{row.sales} sales</strong><b>{money(row.revenue)}</b><small>{row.productsSold} products</small></div>)}</div></article>
      <article className="dash-card"><h2>Inventory Status</h2><div className="inventory-status-grid"><div><span>New Phones</span><strong>{summary.inventory.newPhones}</strong></div><div><span>Used Phones</span><strong>{summary.inventory.usedPhones}</strong></div><div><span>Low Stock</span><strong>{summary.inventory.lowStock}</strong></div><div><span>Transferred</span><strong>{summary.inventory.recentlyTransferred}</strong></div></div></article>
    </section>
    <section className="dash-grid charts">
      <article className="dash-card"><h2>Sales Trend</h2><ResponsiveContainer width="100%" height={230}><BarChart data={summary.trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Bar dataKey="revenue" fill="#1677a6" /><Bar dataKey="sales" fill="#0f9f8f" /></BarChart></ResponsiveContainer></article>
      {user.role === "Admin" && <article className="dash-card"><h2>Store Comparison</h2><ResponsiveContainer width="100%" height={230}><BarChart data={summary.storePerformance}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="store" /><YAxis /><Tooltip /><Bar dataKey="revenue" fill="#1677a6" /><Bar dataKey="inventoryValue" fill="#e3a226" /></BarChart></ResponsiveContainer></article>}
      <article className="dash-card"><h2>Revenue Mix</h2><ResponsiveContainer width="100%" height={230}><BarChart data={summary.revenueMix}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="category" /><YAxis /><Tooltip /><Bar dataKey="revenue" fill="#6d7f3f" /><Bar dataKey="units" fill="#c98b2c" /></BarChart></ResponsiveContainer></article>
    </section>
    {summary.alerts.length > 0 && <section className="dash-alerts">{summary.alerts.map((alert) => <article key={alert.type}><strong>{alert.type}</strong><span>{alert.count}</span><p>{alert.action}</p></article>)}</section>}
    <section className="dash-grid bottom single">
      <article className="dash-card table-card"><div className="dash-card-head"><h2>Recent Sales</h2><Link to="/sales">View All</Link></div><table><thead><tr><th>Job Number</th><th>Product</th><th>Customer</th><th>Store</th><th>Amount</th><th>Time</th></tr></thead><tbody>{summary.recentSales.map((sale) => <tr key={sale.id}><td>{sale.jobNumber}</td><td>{sale.product}</td><td>{sale.customer}</td><td>{sale.store}</td><td>{money(sale.amount)}</td><td>{new Date(sale.time).toLocaleTimeString()}</td></tr>)}</tbody></table></article>
    </section>
  </div>;
};

export default Dashboard;
