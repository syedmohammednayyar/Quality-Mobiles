import React, { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAdminReportOverview } from "../services/api";
import { ALL_STORES, useStoreSelection } from "../context/StoreSelectionContext";
import type { User } from "../types";
import DateField from "../components/DateField";
import { formatDate, formatDateTime, formatDayMonth } from "../utils/dateFormat";
import "./Reports.css";

type Tab = "stores" | "sales" | "inventory" | "movements" | "transfers" | "customers" | "employees" | "buybacks" | "financial" | "losses";
const tabs: Array<[Tab, string]> = [["stores", "Stores"], ["sales", "Sales"], ["inventory", "Inventory"], ["movements", "Product Movement"], ["transfers", "Transfers"], ["customers", "Customers"], ["employees", "Employees"], ["buybacks", "Buybacks"], ["financial", "Financial"], ["losses", "Losses"]];
const LOSS_TYPES = ["DISCOUNT_BELOW_COST", "BUYBACK_RESALE_LOSS", "CLEARANCE_SALE", "PRICE_ADJUSTMENT", "DAMAGED_STOCK", "OTHER"];
// Only the KPI cards relevant to the currently selected report type are shown —
// keys reference overview.kpis (server-computed, already store/date scoped).
const KPI_SETS: Record<Tab, string[]> = {
  stores: ["totalSales", "grossRevenue", "netRevenue", "totalCustomers", "totalEmployees", "inventoryValue"],
  sales: ["totalSales", "netRevenue", "totalPriceAdjustments", "totalExchangeValue", "netProfit", "totalLoss"],
  inventory: ["inventoryValue", "lowStockProducts", "productsSold", "totalTransfers"],
  movements: ["totalTransfers", "lowStockProducts"],
  transfers: ["totalTransfers"],
  customers: ["totalCustomers", "netRevenue"],
  employees: ["totalEmployees", "adjustmentCount"],
  buybacks: ["totalBuybacks", "buybackCost", "exchangeDeviceCount"],
  financial: ["grossRevenue", "netRevenue", "totalExpenses", "netProfit", "outstandingPayments", "buybackCost"],
  losses: ["totalLoss", "lossItemCount", "lossTransactionCount", "averageLoss", "totalProfit", "netGrossResult"],
};
const money = (value: unknown) => `Rs ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pretty = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase());
const isMoneyKey = (key: string) => !/percent/i.test(key) && /revenue|value|price|profit|amount|cost|spending|expenses|payments|loss|discount|result/i.test(key);
const isDateKey = (key: string) => /date|time|createdAt|updatedAt/i.test(key);
const display = (key: string, value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  // Date-only keys keep calendar semantics; timestamps keep their clock time.
  if (isDateKey(key)) return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? formatDate(String(value)) : formatDateTime(String(value), String(value));
  return isMoneyKey(key) ? money(value) : String(value);
};
const csvEscape = (value: unknown) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
// Explicit, ordered CSV columns per report type — [rowKey, "Header Label"].
// Exporting a curated business-meaningful set instead of dumping whatever
// keys happen to be on the row object. Tabs without an entry here fall back
// to the auto-derived columns.
const CSV_COLUMNS: Partial<Record<Tab, Array<[string, string]>>> = {
  sales: [
    ["date", "Date"], ["saleId", "Sale ID"], ["jobNumber", "Job Number"],
    ["product", "Product"], ["imei", "IMEI"], ["customer", "Customer"],
    ["store", "Store"], ["employee", "Employee"],
    ["listPrice", "List Price"], ["billedPrice", "Billed Price"],
    ["adjustmentDelta", "Price Adjustment"], ["amount", "Final Amount"],
    ["paymentMethod", "Payment Method"], ["status", "Status"],
  ],
  losses: [
    ["date", "Date"], ["lossId", "Loss ID"], ["saleId", "Bill Number"],
    ["store", "Store"], ["employee", "Employee"], ["product", "Product"],
    ["imei", "IMEI / SKU"], ["costBasis", "Cost Basis"],
    ["originalPrice", "Original Price"], ["discount", "Discount"],
    ["finalPrice", "Final Price"], ["loss", "Loss"], ["lossPercent", "Loss %"],
    ["reason", "Reason"], ["status", "Status"],
  ],
  inventory: [
    ["jobNumber", "Job Number"], ["brand", "Brand"], ["model", "Model"],
    ["imei", "IMEI"], ["store", "Store"], ["quantity", "Quantity"],
    ["purchasePrice", "Purchase Price"], ["sellingPrice", "Selling Price"],
    ["status", "Stock Status"], ["transferStatus", "Transfer Status"],
  ],
  buybacks: [
    ["date", "Date"], ["buybackId", "Buyback ID"], ["jobNumber", "Job Number"],
    ["customer", "Customer"], ["device", "Device"], ["imei", "IMEI"],
    ["condition", "Condition"], ["buybackPrice", "Buyback Price"],
    ["resalePrice", "Resale Price"], ["profit", "Profit"], ["store", "Store"],
  ],
  stores: [
    ["storeCode", "Store Code"], ["storeName", "Store Name"],
    ["grossRevenue", "Gross Revenue"], ["revenue", "Net Revenue"],
    ["priceAdjustments", "Price Adjustments"], ["exchangeValue", "Exchange Value"],
    ["sales", "Sales"], ["productsSold", "Products Sold"],
    ["inventoryValue", "Inventory Value"], ["buybackValue", "Buyback Value"],
    ["employees", "Employees"],
  ],
  movements: [
    ["date", "Date"], ["jobNumber", "Job Number"], ["imei", "IMEI"],
    ["product", "Product"], ["event", "Movement"], ["store", "Store"],
    ["by", "Handled By"], ["currentStatus", "Current Status"],
  ],
  transfers: [
    ["transferDate", "Transfer Date"], ["jobNumber", "Job Number"],
    ["product", "Product"], ["fromStore", "From Store"], ["toStore", "To Store"],
    ["transferredBy", "Transferred By"],
  ],
  customers: [
    ["customerType", "Customer Type"], ["customer", "Customer Name"],
    ["phone", "Phone"], ["store", "Store"], ["purchases", "Purchases"],
    ["grossSpending", "Gross Spending"], ["spending", "Net Spending"],
    ["adjustments", "Price Adjustments"], ["exchangeValue", "Exchange Value"],
    ["lastPurchase", "Last Purchase"],
  ],
  employees: [
    ["employee", "Employee"], ["role", "Role"], ["store", "Store"],
    ["sales", "Sales"], ["productsSold", "Products Sold"],
    ["grossRevenue", "Gross Revenue"], ["revenue", "Net Revenue"],
    ["priceAdjustments", "Price Adjustments"], ["adjustmentCount", "Adjustment Count"],
    ["lossTotal", "Loss Total"], ["lossTransactions", "Loss Bills"],
    ["lastActivity", "Last Activity"],
  ],
};

// The Financial report is a single summary object, not a list of records, so
// it exports as Metric/Value pairs rather than one very wide row. Nested
// breakdowns are flattened into their own rows — left as-is they stringify to
// "[object Object]" and the figure is lost.
const FINANCIAL_ROWS: Array<[string, string]> = [
  ["grossRevenue", "Gross Revenue"], ["netRevenue", "Net Revenue"],
  ["totalPriceAdjustments", "Total Price Adjustments"],
  ["totalExchangeValue", "Total Exchange Value"],
  ["buybackCost", "Buyback Cost"], ["expenses", "Total Expenses"],
  ["netProfit", "Net Profit"], ["outstandingPayments", "Outstanding Payments"],
  ["totalLoss", "Total Loss"], ["totalProfit", "Total Profit"],
  ["netGrossResult", "Net Gross Result"],
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

const Reports: React.FC<{ user: User }> = ({ user }) => {
  // The store picker in the header is the single source of truth for what this
  // page shows, exactly as it is for the dashboard and the inventory screen.
  // Reports used to hold its own private selection, so an admin who picked a
  // store in the header saw every store's figures here — and the two controls
  // could sit on screen disagreeing with each other. The Store dropdown below
  // is a second view of that same selection, not a separate one.
  const { selectedStoreId, selectedStoreName, isAllStores, stores: allStores, canSwitchStore, selectStore } = useStoreSelection();
  const stores = useMemo(() => allStores.filter((x) => x.is_active), [allStores]);
  // A manager is pinned to their own store whatever the selection says; for an
  // admin, "All Stores" means no store filter at all.
  const scopeStoreId = user.role === "Manager"
    ? (user.assignedStoreId || "")
    : (isAllStores ? "" : selectedStoreId);
  const scopeStoreName = stores.find((s) => s.id === scopeStoreId)?.name
    || (scopeStoreId ? selectedStoreName : "");
  const [quickRange, setQuickRange] = useState("this_month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("stores");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<any>(null);
  const [lossEmployeeFilter, setLossEmployeeFilter] = useState("");
  const [lossTypeFilter, setLossTypeFilter] = useState("");
  const [lossStatusFilter, setLossStatusFilter] = useState("");
  const [viewRow, setViewRow] = useState<Record<string, unknown> | null>(null);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));

  // Client-side guard so an obviously invalid range never even hits the API
  // (the backend validates independently and is still the final authority).
  const rangeError = quickRange === "custom" && fromDate && toDate && fromDate > toDate
    ? "From date cannot be after To date."
    : "";

  const filters = useMemo(() => ({
    quickRange: quickRange as any,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    month: quickRange === "month_year" ? month : undefined,
    year: quickRange === "month_year" ? year : undefined,
    storeIds: scopeStoreId ? [scopeStoreId] : [],
  }), [quickRange, fromDate, toDate, month, year, scopeStoreId]);

  useEffect(() => {
    // Don't fire a request we already know is invalid, or an incomplete
    // custom range (both dates required).
    if (rangeError) return;
    if (quickRange === "custom" && (!fromDate || !toDate)) return;
    void (async () => {
      try { setLoading(true); setError(""); setOverview(await getAdminReportOverview(filters)); }
      catch (e) { setError(e instanceof Error ? e.message : "Failed to load reports"); }
      finally { setLoading(false); }
    })();
  }, [filters, rangeError, quickRange, fromDate, toDate]);

  const rows = useMemo(() => {
    if (!overview) return [];
    let source = tab === "stores" ? overview.storePerformance : tab === "financial" ? [overview.reports.financial] : overview.reports[tab];
    if (tab === "losses") {
      if (lossEmployeeFilter) source = source.filter((row: any) => row.employee === lossEmployeeFilter);
      if (lossTypeFilter) source = source.filter((row: any) => row.reason === lossTypeFilter);
      if (lossStatusFilter) source = source.filter((row: any) => row.status === lossStatusFilter);
    }
    const query = search.trim().toLowerCase();
    return query ? source.filter((row: any) => Object.values(row).some((value) => String(value || "").toLowerCase().includes(query))) : source;
  }, [overview, search, tab, lossEmployeeFilter, lossTypeFilter, lossStatusFilter]);

  const lossEmployees = useMemo(() => {
    if (!overview) return [];
    return Array.from(new Set((overview.reports.losses || []).map((row: any) => row.employee).filter(Boolean))) as string[];
  }, [overview]);

  // Filename documents exactly what's in the file: report type + store + date
  // scope \u2014 matches the CRITICAL rule that the export mirrors the current view.
  const exportFileName = useMemo(() => {
    const storeLabel = scopeStoreId ? slugify(scopeStoreName || "store") : "all-stores";
    const dateLabel = quickRange === "custom"
      ? `${fromDate || "start"}_to_${toDate || "end"}`
      : quickRange === "month_year"
        ? (month === "all" ? String(year) : `${slugify(MONTHS[Number(month) - 1] || "")}-${year}`)
        : quickRange;
    return `${tab}-report_${storeLabel}_${dateLabel}.csv`;
  }, [tab, scopeStoreId, scopeStoreName, quickRange, fromDate, toDate, month, year]);

  // Human-readable description of the active scope, reused by the empty state
  // so the user can see exactly which filters produced zero rows.
  const scopeLabel = useMemo(() => {
    const storeName = scopeStoreId
      ? (scopeStoreName || (user.role === "Manager" ? "your store" : "the selected store"))
      : "all stores";
    const dateLabel = quickRange === "custom"
      ? `${fromDate ? formatDate(fromDate) : "?"} to ${toDate ? formatDate(toDate) : "?"}`
      : quickRange === "month_year"
        ? (month === "all" ? String(year) : `${MONTHS[Number(month) - 1] || ""} ${year}`)
        : pretty(quickRange).toLowerCase();
    return `${dateLabel} · ${storeName}`;
  }, [quickRange, fromDate, toDate, month, year, scopeStoreId, scopeStoreName, user.role]);

  // Every section is exportable, so the only thing that can stop an export is
  // having no rows to write. The button now reflects that instead of silently
  // doing nothing: returning early on an empty table was indistinguishable,
  // from the user's side, from the feature not existing on that tab at all.
  const canExport = rows.length > 0;

  const buildCsv = (): string => {
    // The Financial report is one summary object rather than a list of
    // records, so it is written as Metric/Value pairs and its nested
    // breakdown is expanded into rows. Left as a plain cell that breakdown
    // stringifies to "[object Object]" and the figures are lost.
    if (tab === "financial") {
      const summary: any = rows[0] || {};
      const lines: string[][] = [["Metric", "Value"]];
      FINANCIAL_ROWS.forEach(([key, label]) => {
        if (key in summary) lines.push([label, display(key, summary[key])]);
      });
      Object.entries(summary.adjustmentByCategory || {}).forEach(([category, value]: [string, any]) => {
        lines.push([`Price Adjustments - ${pretty(category)} (count)`, String(value?.count ?? 0)]);
        lines.push([`Price Adjustments - ${pretty(category)} (total)`, money(value?.totalDiscount ?? 0)]);
      });
      return lines.map((line) => line.map(csvEscape).join(",")).join("\n");
    }

    // Curated columns when defined for this report type, else derive from the
    // row shape. Either way the DATA is exactly `rows` — the same filtered,
    // searched set currently rendered in the table.
    // A curated column survives when ANY row carries it: keying off rows[0]
    // alone silently dropped columns the first row happened not to have.
    const defined = CSV_COLUMNS[tab];
    const columns: Array<[string, string]> = defined
      ? defined.filter(([key]) => rows.some((row: any) => key in row))
      : Object.keys(rows[0]).filter((x) => x !== "id").map((key) => [key, pretty(key)]);

    return [
      columns.map(([, label]) => csvEscape(label)),
      // Same values the table shows, formatted the same way — this is the
      // human-readable export, not the raw system feed.
      ...rows.map((row: any) => columns.map(([key]) => csvEscape(display(key, row[key])))),
    ].map((line) => line.join(",")).join("\n");
  };

  const exportSheet = () => {
    if (!canExport) return;
    const url = URL.createObjectURL(new Blob([`\uFEFF${buildCsv()}`], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = exportFileName; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="reports-page">
    <header className="module-header reports-topbar"><div><h1>Business Control Center</h1><p>{user.role === "Admin" ? "Complete visibility across every Quality Mobiles store." : "Performance and operations for your assigned store."}</p></div><div className="reports-export"><button onClick={() => exportSheet()} disabled={!canExport} title={canExport ? `Export the ${pretty(tab).toLowerCase()} report for ${scopeLabel}` : `Nothing to export — no ${pretty(tab).toLowerCase()} records for ${scopeLabel}`}>Export CSV</button><button onClick={() => window.print()}>Print</button></div></header>
    <nav className="reports-tabs reports-tabs-top">{tabs.map(([key, label]) => <button className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key)}>{label}</button>)}</nav>
    <section className="reports-filters">
      {/* Writes through to the shared selection, so the header and this page
          can never end up scoped to different stores. */}
      <label><span>Store</span><select value={scopeStoreId} onChange={(e) => selectStore({ id: e.target.value || ALL_STORES, name: stores.find((s) => s.id === e.target.value)?.name || "All Stores" })} disabled={!canSwitchStore}><option value="">All Stores</option>{stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}</select></label>
      <label><span>Date Range</span><select value={quickRange} onChange={(e) => setQuickRange(e.target.value)}>
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="this_week">This Week</option>
        <option value="this_month">This Month</option>
        <option value="last_month">Last Month</option>
        <option value="this_year">This Year</option>
        <option value="last_year">Last Year</option>
        <option value="month_year">Month / Year</option>
        <option value="custom">Custom Range</option>
        <option value="all">All Time</option>
      </select></label>
      {quickRange === "month_year" && <>
        <label><span>Month</span><select value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">Whole Year</option>
          {MONTHS.map((label, index) => <option key={label} value={String(index + 1)}>{label}</option>)}
        </select></label>
        <label><span>Year</span><select value={year} onChange={(e) => setYear(e.target.value)}>
          {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select></label>
      </>}
      {quickRange === "custom" && <><label><span>From</span><DateField value={fromDate} onChange={setFromDate} title="From date" /></label><label><span>To</span><DateField value={toDate} onChange={setToDate} title="To date" /></label></>}
      <label className="reports-search"><span>Global Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Job, IMEI, customer, employee, sale..." /></label>
    </section>
    {rangeError && <p className="reports-error">{rangeError}</p>}
    {error && !rangeError && <p className="reports-error">{error}</p>}
    {loading && !rangeError && <p className="reports-status">Loading {pretty(tab).toLowerCase()} report...</p>}
    {overview && <>
      <section className="reports-kpi-grid">{(KPI_SETS[tab] || []).filter((key) => overview.kpis[key] !== undefined).map((key) => <article className={`reports-kpi-card${/loss/i.test(key) ? " loss" : ""}`} key={key}><p>{pretty(key)}</p><h3>{isMoneyKey(key) ? money(overview.kpis[key]) : Number(overview.kpis[key] || 0).toLocaleString()}</h3></article>)}</section>
      <section className="reports-analytics">
        <article><h2>Revenue Trend</h2><ResponsiveContainer width="100%" height={260}><LineChart data={overview.trends}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={(value: string) => formatDayMonth(value, value)} /><YAxis /><Tooltip labelFormatter={(value: string) => formatDate(value, value)} /><Legend /><Line dataKey="sales" stroke="#1677a6" strokeWidth={2} /><Line dataKey="buybacks" stroke="#e3a226" strokeWidth={2} /></LineChart></ResponsiveContainer></article>
        <article><h2>Store Comparison</h2><ResponsiveContainer width="100%" height={260}><BarChart data={overview.storePerformance}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="storeName" /><YAxis /><Tooltip /><Bar dataKey="revenue" fill="#1677a6" /><Bar dataKey="inventoryValue" fill="#e3a226" /></BarChart></ResponsiveContainer></article>
      </section>
      {tab === "losses" && <section className="reports-filters">
        <label><span>Employee</span><select value={lossEmployeeFilter} onChange={(e) => setLossEmployeeFilter(e.target.value)}><option value="">All Employees</option>{lossEmployees.map((emp) => <option key={emp} value={emp}>{emp}</option>)}</select></label>
        <label><span>Loss Type</span><select value={lossTypeFilter} onChange={(e) => setLossTypeFilter(e.target.value)}><option value="">All Types</option>{LOSS_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></label>
        <label><span>Status</span><select value={lossStatusFilter} onChange={(e) => setLossStatusFilter(e.target.value)}><option value="">All Statuses</option><option value="active">Active</option><option value="reversed">Reversed</option></select></label>
      </section>}
      <section className="reports-table-wrap"><table className="reports-table"><thead><tr>{rows[0] && Object.keys(rows[0]).filter((x) => x !== "id").map((key) => <th key={key}>{pretty(key)}</th>)}<th></th></tr></thead><tbody>{rows.map((row: any, index: number) => <tr key={row.id || index}>{Object.entries(row).filter(([key]) => key !== "id").map(([key, value]) => <td key={key}>{display(key, value)}</td>)}<td><button type="button" className="reports-view-btn" onClick={() => setViewRow(row)}>View</button></td></tr>)}{!rows.length && <tr><td className="reports-empty" colSpan={12}><strong>No {pretty(tab).toLowerCase()} records found</strong><span>Nothing matches {scopeLabel}. Try changing the date range or store filter.</span></td></tr>}</tbody></table></section>
    </>}

    {viewRow && (
      <div className="reports-drawer-overlay" onClick={() => setViewRow(null)}>
        <div className="reports-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="reports-drawer-head"><h2>{pretty(tab)} Details</h2><button type="button" onClick={() => setViewRow(null)} aria-label="Close">×</button></div>
          <div className="reports-drawer-body">
            <dl>
              {Object.entries(viewRow).filter(([key]) => key !== "id").map(([key, value]) => (
                <React.Fragment key={key}><dt>{pretty(key)}</dt><dd>{display(key, value)}</dd></React.Fragment>
              ))}
            </dl>
          </div>
        </div>
      </div>
    )}
  </div>;
};
export default Reports;
