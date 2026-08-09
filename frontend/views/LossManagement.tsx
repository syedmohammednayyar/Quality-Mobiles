import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  exportLosses,
  getLoss,
  getLossSummary,
  listEmployees,
  listLosses,
  listStores,
  type ApiEmployee,
  type ApiLoss,
  type ApiLossSummary,
  type ApiStore,
  type LossFilters,
} from "../services/api";
import type { User } from "../types";
import "./LossManagement.css";

const LOSS_TYPES = ["DISCOUNT_BELOW_COST", "BUYBACK_RESALE_LOSS", "CLEARANCE_SALE", "PRICE_ADJUSTMENT", "DAMAGED_STOCK", "OTHER"];
const PRODUCT_TYPES: Array<[string, string]> = [["new_phone", "New Phone"], ["used_phone", "Used Phone"], ["accessory", "Accessory"], ["service", "Service"], ["repair_part", "Repair Part"]];
const PAGE_SIZE = 25;

const money = (value: number | string) => `Rs ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const label = (value: string) => (value || "").replace(/_/g, " ");

const LossManagement: React.FC<{ user: User }> = ({ user }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [stores, setStores] = useState<ApiStore[]>([]);
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [summary, setSummary] = useState<ApiLossSummary | null>(null);
  const [rows, setRows] = useState<ApiLoss[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ApiLoss | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [quickRange, setQuickRange] = useState<"today" | "yesterday" | "this_week" | "this_month" | "this_year" | "custom">("this_month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [storeId, setStoreId] = useState(searchParams.get("storeId") || "");
  const [employeeId, setEmployeeId] = useState(searchParams.get("employeeId") || "");
  const [brand, setBrand] = useState("");
  const [productType, setProductType] = useState("");
  const [lossType, setLossType] = useState(searchParams.get("lossType") || "");
  const [lossStatus, setLossStatus] = useState<"active" | "reversed">("active");
  const [search, setSearch] = useState("");

  const isManager = user.role === "Manager";

  useEffect(() => {
    void listStores().then((data) => setStores(data.filter((s) => s.is_active)));
    void listEmployees().then(setEmployees).catch(() => {});
  }, []);

  const dateRange = useMemo(() => {
    if (quickRange !== "custom") return { fromDate: undefined, toDate: undefined };
    return { fromDate: fromDate || undefined, toDate: toDate || undefined };
  }, [quickRange, fromDate, toDate]);

  const filters: LossFilters = useMemo(() => ({
    fromDate: dateRange.fromDate,
    toDate: dateRange.toDate,
    storeIds: isManager && user.assignedStoreId ? [user.assignedStoreId] : storeId ? [storeId] : [],
    employeeId: employeeId || undefined,
    brand: brand || undefined,
    productType: productType || undefined,
    lossType: (lossType as LossFilters["lossType"]) || undefined,
    lossStatus,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [dateRange, storeId, employeeId, brand, productType, lossType, lossStatus, search, page, isManager, user.assignedStoreId]);

  // quickRange isn't sent to the backend directly (backend only knows fromDate/toDate) —
  // translate it client-side, mirroring Reports.tsx's pattern.
  const resolvedFilters: LossFilters = useMemo(() => {
    if (quickRange === "custom") return filters;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = 86400000;
    const ranges: Record<string, [Date, Date]> = {
      today: [today, today],
      yesterday: [new Date(today.getTime() - day), new Date(today.getTime() - day)],
      this_week: [new Date(today.getTime() - ((today.getDay() + 6) % 7) * day), today],
      this_month: [new Date(today.getFullYear(), today.getMonth(), 1), today],
      this_year: [new Date(today.getFullYear(), 0, 1), today],
    };
    const [start, end] = ranges[quickRange] || ranges.this_month;
    return { ...filters, fromDate: start.toISOString(), toDate: end.toISOString() };
  }, [filters, quickRange]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError("");
        const [summaryData, listData] = await Promise.all([
          getLossSummary(resolvedFilters),
          listLosses(resolvedFilters),
        ]);
        if (cancelled) return;
        setSummary(summaryData);
        setRows(listData.rows);
        setTotal(listData.total);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load loss data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [resolvedFilters]);

  useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (highlight) void openDetail(highlight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const loss = await getLoss(id);
      setDetail(loss);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load loss detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    if (searchParams.get("highlight")) {
      const next = new URLSearchParams(searchParams);
      next.delete("highlight");
      setSearchParams(next);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportLosses(resolvedFilters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `loss-report-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="loss-page">
      <header className="module-header loss-topbar">
        <div>
          <h1>Loss Management</h1>
          <p>Track and investigate every sale-item that fell below its cost basis.</p>
        </div>
        <button type="button" className="loss-export-btn" onClick={() => void handleExport()}>Export CSV</button>
      </header>

      {error && <p className="loss-error">{error}</p>}

      <section className="loss-summary-grid">
        <article><span>Total Loss</span><strong>{money(summary?.totalLoss || 0)}</strong></article>
        <article><span>Loss Transactions</span><strong>{summary?.lossTransactionCount || 0}</strong></article>
        <article><span>Loss Items</span><strong>{summary?.lossItemCount || 0}</strong></article>
        <article><span>Average Loss</span><strong>{money(summary?.averageLoss || 0)}</strong></article>
        <article><span>Total Profit</span><strong className="profit">{money(summary?.totalProfit || 0)}</strong></article>
        <article><span>Net Gross Result</span><strong className={(summary?.netGrossResult || 0) < 0 ? "loss" : "profit"}>{money(summary?.netGrossResult || 0)}</strong></article>
      </section>

      <section className="loss-filters">
        <label><span>Date Range</span>
          <select value={quickRange} onChange={(e) => { setQuickRange(e.target.value as typeof quickRange); setPage(0); }}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="this_year">This Year</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {quickRange === "custom" && <>
          <label><span>From</span><input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0); }} /></label>
          <label><span>To</span><input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0); }} /></label>
        </>}
        <label><span>Store</span>
          <select value={isManager ? (user.assignedStoreId || "") : storeId} onChange={(e) => { setStoreId(e.target.value); setPage(0); }} disabled={isManager}>
            <option value="">All Stores</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label><span>Employee</span>
          <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setPage(0); }}>
            <option value="">All Employees</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </label>
        <label><span>Product Type</span>
          <select value={productType} onChange={(e) => { setProductType(e.target.value); setPage(0); }}>
            <option value="">All Types</option>
            {PRODUCT_TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label><span>Brand</span><input value={brand} onChange={(e) => { setBrand(e.target.value); setPage(0); }} placeholder="e.g. Apple" /></label>
        <label><span>Loss Type</span>
          <select value={lossType} onChange={(e) => { setLossType(e.target.value); setPage(0); }}>
            <option value="">All Loss Types</option>
            {LOSS_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </label>
        <label><span>Status</span>
          <select value={lossStatus} onChange={(e) => { setLossStatus(e.target.value as "active" | "reversed"); setPage(0); }}>
            <option value="active">Active</option>
            <option value="reversed">Reversed</option>
          </select>
        </label>
        <label className="loss-search"><span>Search</span><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Loss ID, bill, product, IMEI, SKU..." /></label>
      </section>

      {loading && <p className="loss-status">Loading loss records...</p>}

      {!loading && rows.length === 0 && (
        <section className="loss-empty-state">
          <h2>✓ No losses found</h2>
          <p>There are no loss transactions for the selected filters.</p>
        </section>
      )}

      {!loading && rows.length > 0 && (
        <>
          <section className="loss-table-wrap">
            <table className="loss-table">
              <thead>
                <tr>
                  <th>Date</th><th>Bill</th><th>Store</th><th>Employee</th><th>Product</th><th>IMEI/SKU</th>
                  <th>Cost</th><th>Original</th><th>Discount</th><th>Final</th><th>Loss</th><th>Loss %</th>
                  <th>Reason</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="loss-table-row" onClick={() => void openDetail(row.id)}>
                    <td>{new Date(row.created_at).toLocaleDateString()}</td>
                    <td>{row.sale_no}</td>
                    <td>{row.store_name}</td>
                    <td>{row.employee_name}</td>
                    <td>{row.product_name}</td>
                    <td>{row.imei || row.sku || "-"}</td>
                    <td>{money(row.cost_basis)}</td>
                    <td>{money(row.original_selling_price)}</td>
                    <td>{money(row.discount_amount)}</td>
                    <td>{money(row.effective_selling_amount)}</td>
                    <td className="loss-cell">{money(row.loss_amount)}</td>
                    <td>{row.loss_percentage}%</td>
                    <td>{label(row.loss_type)}</td>
                    <td><span className={`loss-status-pill ${row.loss_status}`}>{row.loss_status}</span></td>
                    <td><button type="button" className="loss-view-btn" onClick={(e) => { e.stopPropagation(); void openDetail(row.id); }}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="loss-pagination">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</button>
            <span>Page {page + 1} of {totalPages} ({total} records)</span>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </>
      )}

      {(detail || detailLoading) && (
        <div className="loss-drawer-overlay" onClick={closeDetail}>
          <div className="loss-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="loss-drawer-head">
              <h2>Loss Details</h2>
              <button type="button" onClick={closeDetail} aria-label="Close">×</button>
            </div>
            {detailLoading && <p className="loss-status">Loading...</p>}
            {detail && !detailLoading && (
              <div className="loss-drawer-body">
                <p className="loss-drawer-id">Loss ID: {detail.id}</p>
                <dl>
                  <dt>Sale</dt><dd>{detail.sale_no}</dd>
                  <dt>Store</dt><dd>{detail.store_name}</dd>
                  <dt>Employee</dt><dd>{detail.employee_name}</dd>
                  <dt>Customer</dt><dd>{detail.customer_name || "Walk-in"}</dd>
                  <dt>Product</dt><dd>{detail.product_name}</dd>
                  <dt>IMEI/SKU</dt><dd>{detail.imei || detail.sku || "-"}</dd>
                </dl>
                <div className="loss-drawer-financials">
                  <div><span>Cost Basis</span><strong>{money(detail.cost_basis)}</strong></div>
                  <div><span>Original Selling Price</span><strong>{money(detail.original_selling_price)}</strong></div>
                  <div><span>Discount Allocated</span><strong>{money(detail.discount_amount)}</strong></div>
                  <div><span>Effective Selling Price</span><strong>{money(detail.effective_selling_amount)}</strong></div>
                  <div className="highlight"><span>Loss</span><strong>{money(detail.loss_amount)}</strong></div>
                  <div className="highlight"><span>Loss %</span><strong>{detail.loss_percentage}%</strong></div>
                </div>
                {detail.buyback && (
                  <div className="loss-drawer-buyback">
                    <h3>Buyback Cost Basis</h3>
                    <p>{detail.buyback.brand} {detail.buyback.model} — Buyback {money(detail.buyback.negotiated_price)} + Repair {money(detail.buyback.repair_cost)}</p>
                  </div>
                )}
                <dl>
                  <dt>Loss Type</dt><dd>{label(detail.loss_type)}</dd>
                  <dt>Reason</dt><dd>{detail.loss_reason || "-"}</dd>
                  <dt>Status</dt><dd><span className={`loss-status-pill ${detail.loss_status}`}>{detail.loss_status}</span></dd>
                  {detail.loss_status === "reversed" && <><dt>Reversal Reason</dt><dd>{detail.reversal_reason || "-"}</dd></>}
                  <dt>Created</dt><dd>{new Date(detail.created_at).toLocaleString()}</dd>
                </dl>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LossManagement;
