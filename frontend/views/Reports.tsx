import React, { useEffect, useMemo, useState } from "react";
import { exportAdminReportPdf, getAdminReportOverview, listStores, type ApiStore } from "../services/api";
import type { User } from "../types";
import "./Reports.css";

const Reports: React.FC<{ user: User }> = ({ user }) => {
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [quickRange, setQuickRange] = useState<"today" | "yesterday" | "this_week" | "this_month" | "last_month" | "custom">("this_month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<any>(null);

  const filters = useMemo(() => ({ quickRange, fromDate: fromDate || undefined, toDate: toDate || undefined, storeIds: selectedStore ? [selectedStore] : [] }), [quickRange, fromDate, toDate, selectedStore]);

  useEffect(() => { void (async () => setStores((await listStores()).filter((s) => s.is_active)))(); }, []);
  useEffect(() => {
    void (async () => {
      try {
        setLoading(true); setError("");
        setOverview(await getAdminReportOverview(filters));
      } catch (e) { setError(e instanceof Error ? e.message : "Failed to load reports"); }
      finally { setLoading(false); }
    })();
  }, [filters]);

  const onExportPdf = async () => {
    try {
      setExporting(true);
      const blob = await exportAdminReportPdf(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `admin-report-${new Date().toISOString().slice(0, 10)}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  if (user.role !== "Admin") return <div className="reports-page"><p className="reports-error">Reports are restricted. Admin access required.</p></div>;

  return <div className="reports-page">
    <div className="reports-topbar"><div><h1>Admin Analytics Center</h1><p>Centralized monitoring across all 4 stores.</p></div></div>
    <div className="reports-filters card">
      <div className="reports-grid">
        <div><label>Store</label><select className="form-input" value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)}><option value="">All Stores</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label>Quick Range</label><select className="form-input" value={quickRange} onChange={(e) => setQuickRange(e.target.value as any)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="this_week">This Week</option><option value="this_month">This Month</option><option value="last_month">Last Month</option><option value="custom">Custom</option></select></div>
        {quickRange === "custom" && <><div><label>From</label><input className="form-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div><div><label>To</label><input className="form-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div></>}
      </div>
      <div className="reports-actions"><button className="btn btn-primary reports-btn" onClick={onExportPdf} disabled={exporting || loading}>{exporting ? "Generating PDF..." : "Export PDF"}</button></div>
    </div>
    {loading && <p className="reports-status">Loading analytics...</p>}
    {error && <p className="reports-error">{error}</p>}
    {overview && <section className="reports-kpi-grid">
      <article className="reports-kpi-card tone-primary"><p>Sales</p><h3>Rs {Math.round(overview.kpis.totalSales).toLocaleString()}</h3></article>
      <article className="reports-kpi-card tone-teal"><p>Repairs</p><h3>Rs {Math.round(overview.kpis.totalRepairs).toLocaleString()}</h3></article>
      <article className="reports-kpi-card tone-amber"><p>Expenses</p><h3>Rs {Math.round(overview.kpis.totalExpenses).toLocaleString()}</h3></article>
      <article className="reports-kpi-card tone-indigo"><p>Net</p><h3>Rs {Math.round(overview.kpis.net).toLocaleString()}</h3></article>
    </section>}
  </div>;
};

export default Reports;
