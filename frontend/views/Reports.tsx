import React, { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { exportAdminReportPdf, getAdminReportOverview, listStores, type ApiStore } from "../services/api";
import type { User } from "../types";
import "./Reports.css";

type Tab = "stores" | "sales" | "inventory" | "movements" | "transfers" | "customers" | "employees" | "buybacks" | "financial";
const tabs: Array<[Tab, string]> = [["stores", "Stores"], ["sales", "Sales"], ["inventory", "Inventory"], ["movements", "Product Movement"], ["transfers", "Transfers"], ["customers", "Customers"], ["employees", "Employees"], ["buybacks", "Buybacks"], ["financial", "Financial"]];
const money = (value: unknown) => `Rs ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pretty = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase());
const display = (key: string, value: unknown) => /revenue|value|price|profit|amount|cost|spending|expenses|payments/i.test(key) ? money(value) : value ? String(value) : "-";

const Reports: React.FC<{ user: User }> = ({ user }) => {
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [quickRange, setQuickRange] = useState("this_month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("stores");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<any>(null);

  const filters = useMemo(() => ({
    quickRange: quickRange as any, fromDate: fromDate || undefined, toDate: toDate || undefined,
    storeIds: user.role === "Manager" && user.assignedStoreId ? [user.assignedStoreId] : selectedStore ? [selectedStore] : [],
  }), [quickRange, fromDate, toDate, selectedStore, user.assignedStoreId, user.role]);

  useEffect(() => { void listStores().then((rows) => setStores(rows.filter((x) => x.is_active))); }, []);
  useEffect(() => {
    void (async () => {
      try { setLoading(true); setError(""); setOverview(await getAdminReportOverview(filters)); }
      catch (e) { setError(e instanceof Error ? e.message : "Failed to load reports"); }
      finally { setLoading(false); }
    })();
  }, [filters]);

  const rows = useMemo(() => {
    if (!overview) return [];
    const source = tab === "stores" ? overview.storePerformance : tab === "financial" ? [overview.reports.financial] : overview.reports[tab];
    const query = search.trim().toLowerCase();
    return query ? source.filter((row: any) => Object.values(row).some((value) => String(value || "").toLowerCase().includes(query))) : source;
  }, [overview, search, tab]);

  const exportSheet = (excel = false) => {
    if (!rows.length) return;
    const columns = Object.keys(rows[0]).filter((x) => x !== "id");
    const csv = [columns.map(pretty), ...rows.map((row: any) => columns.map((key) => JSON.stringify(row[key] ?? "")))].map((line) => line.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: excel ? "application/vnd.ms-excel" : "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = `${tab}-report.${excel ? "xls" : "csv"}`; link.click(); URL.revokeObjectURL(url);
  };
  const exportPdf = async () => {
    try { setExporting(true); const blob = await exportAdminReportPdf(filters); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "business-control-report.pdf"; link.click(); URL.revokeObjectURL(url); }
    finally { setExporting(false); }
  };

  return <div className="reports-page">
    <header className="reports-topbar"><div><h1>Business Control Center</h1><p>{user.role === "Admin" ? "Complete visibility across every Quality Mobiles store." : "Performance and operations for your assigned store."}</p></div><div className="reports-export"><button onClick={() => exportSheet()}>Export CSV</button><button onClick={() => exportSheet(true)}>Export Excel</button><button onClick={() => window.print()}>Print</button><button className="primary" onClick={exportPdf} disabled={exporting}>{exporting ? "Preparing..." : "Export PDF"}</button></div></header>
    <section className="reports-filters">
      <label><span>Store</span><select value={user.role === "Manager" ? user.assignedStoreId : selectedStore} onChange={(e) => setSelectedStore(e.target.value)} disabled={user.role === "Manager"}><option value="">All Stores</option>{stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}</select></label>
      <label><span>Date Range</span><select value={quickRange} onChange={(e) => setQuickRange(e.target.value)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="this_week">This Week</option><option value="this_month">This Month</option><option value="this_year">This Year</option><option value="custom">Custom</option></select></label>
      {quickRange === "custom" && <><label><span>From</span><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label><label><span>To</span><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label></>}
      <label className="reports-search"><span>Global Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Job, IMEI, customer, employee, sale..." /></label>
    </section>
    {error && <p className="reports-error">{error}</p>}
    {loading && <p className="reports-status">Loading business intelligence...</p>}
    {overview && <>
      <section className="reports-kpi-grid">{Object.entries(overview.kpis).slice(0, 12).map(([key, value]) => <article className="reports-kpi-card" key={key}><p>{pretty(key)}</p><h3>{/revenue|value|cost|expenses|payments/i.test(key) ? money(value) : Number(value || 0).toLocaleString()}</h3></article>)}</section>
      <section className="reports-analytics">
        <article><h2>Revenue Trend</h2><ResponsiveContainer width="100%" height={260}><LineChart data={overview.trends}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line dataKey="sales" stroke="#1677a6" strokeWidth={2} /><Line dataKey="buybacks" stroke="#e3a226" strokeWidth={2} /></LineChart></ResponsiveContainer></article>
        <article><h2>Store Comparison</h2><ResponsiveContainer width="100%" height={260}><BarChart data={overview.storePerformance}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="storeName" /><YAxis /><Tooltip /><Bar dataKey="revenue" fill="#1677a6" /><Bar dataKey="inventoryValue" fill="#e3a226" /></BarChart></ResponsiveContainer></article>
      </section>
      <nav className="reports-tabs">{tabs.map(([key, label]) => <button className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key)}>{label}</button>)}</nav>
      <section className="reports-table-wrap"><table className="reports-table"><thead><tr>{rows[0] && Object.keys(rows[0]).filter((x) => x !== "id").map((key) => <th key={key}>{pretty(key)}</th>)}</tr></thead><tbody>{rows.map((row: any, index: number) => <tr key={row.id || index}>{Object.entries(row).filter(([key]) => key !== "id").map(([key, value]) => <td key={key}>{display(key, value)}</td>)}</tr>)}{!rows.length && <tr><td className="reports-empty">No records match the selected filters.</td></tr>}</tbody></table></section>
    </>}
  </div>;
};
export default Reports;
