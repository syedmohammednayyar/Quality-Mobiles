import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '../types';
import {
  downloadReportFile,
  getReportData,
  listStores,
  type ApiStore,
  type ProductReportRow,
  type ReportDataResponse,
  type ReportFilters,
  type ReportPeriod,
  type ReportType,
  type SalesReportRow,
  type StoreReportRow,
} from '../services/api';
import './Reports.css';

const todayIso = new Date().toISOString().slice(0, 10);
const weekStartIso = new Date(Date.now() - (6 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
const periodLabelMap: Record<ReportPeriod, string> = {
  daily: 'Today',
  weekly: 'Last 7 Days',
  monthly: 'Current Month',
  custom: 'Custom Range',
};

const Reports: React.FC<{ user: User }> = ({ user }) => {
  const [reportType, setReportType] = useState<ReportType>('sales');
  const [period, setPeriod] = useState<ReportPeriod>('weekly');
  const [fromDate, setFromDate] = useState(weekStartIso);
  const [toDate, setToDate] = useState(todayIso);
  const [store, setStore] = useState('');
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [reportData, setReportData] = useState<ReportDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState('');

  const tableColumnCount = reportType === 'product' ? 5 : 4;

  useEffect(() => {
    const loadStores = async () => {
      try {
        const storeData = await listStores();
        setStores(storeData.filter((entry) => entry.is_active));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stores');
      }
    };

    void loadStores();
  }, []);

  const filters = useMemo<ReportFilters>(() => {
    const value: ReportFilters = {
      type: reportType,
      period,
      store: store || undefined,
    };

    if (period === 'custom') {
      value.from = fromDate;
      value.to = toDate;
    }

    return value;
  }, [reportType, period, fromDate, toDate, store]);

  const loadReportData = useCallback(async () => {
    if (period === 'custom' && (!fromDate || !toDate)) {
      setError('Custom range requires both from and to dates.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await getReportData(filters);
      setReportData(response);
      setLastSyncedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [filters, period, fromDate, toDate]);

  useEffect(() => {
    void loadReportData();
  }, [loadReportData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadReportData();
    }, 30000);

    return () => window.clearInterval(timer);
  }, [loadReportData]);

  const handleDownload = async (format: 'csv' | 'xlsx') => {
    try {
      setExporting(format);
      const blob = await downloadReportFile(filters, format);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${reportType}_report_${period}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export report');
    } finally {
      setExporting(null);
    }
  };

  const summary = useMemo(() => {
    if (!reportData || reportData.rows.length === 0) {
      return {
        totalRevenue: 0,
        totalUnits: 0,
        totalTransactions: 0,
        averageTicket: 0,
        topLabel: 'No data yet',
        topRevenue: 0,
      };
    }

    let totalRevenue = 0;
    let totalUnits = 0;
    let totalTransactions = 0;
    let topLabel = 'No data yet';
    let topRevenue = 0;

    if (reportType === 'sales') {
      (reportData.rows as SalesReportRow[]).forEach((row) => {
        totalRevenue += row.revenue;
        totalUnits += row.unitsSold;
        totalTransactions += row.transactions;
        if (row.revenue > topRevenue) {
          topRevenue = row.revenue;
          topLabel = `Best Day: ${row.date}`;
        }
      });
    } else if (reportType === 'product') {
      (reportData.rows as ProductReportRow[]).forEach((row) => {
        totalRevenue += row.revenue;
        totalUnits += row.unitsSold;
        totalTransactions += row.transactions;
        if (row.revenue > topRevenue) {
          topRevenue = row.revenue;
          topLabel = `Top Product: ${row.productName}`;
        }
      });
    } else {
      (reportData.rows as StoreReportRow[]).forEach((row) => {
        totalRevenue += row.revenue;
        totalUnits += row.unitsSold;
        totalTransactions += row.transactions;
        if (row.revenue > topRevenue) {
          topRevenue = row.revenue;
          topLabel = `Top Store: ${row.storeName}`;
        }
      });
    }

    return {
      totalRevenue,
      totalUnits,
      totalTransactions,
      averageTicket: totalTransactions ? totalRevenue / totalTransactions : 0,
      topLabel,
      topRevenue,
    };
  }, [reportData, reportType]);

  const renderRows = () => {
    if (loading && !reportData) {
      return (
        <tr>
          <td colSpan={tableColumnCount} className="reports-empty">Loading report rows...</td>
        </tr>
      );
    }

    if (!reportData || reportData.rows.length === 0) {
      return (
        <tr>
          <td colSpan={tableColumnCount} className="reports-empty">No rows found for selected filters.</td>
        </tr>
      );
    }

    if (reportType === 'sales') {
      return (reportData.rows as SalesReportRow[]).map((row) => (
        <tr key={row.date}>
          <td>{row.date}</td>
          <td>{row.transactions}</td>
          <td>{row.unitsSold}</td>
          <td className="reports-amount">Rs {row.revenue.toLocaleString()}</td>
        </tr>
      ));
    }

    if (reportType === 'product') {
      return (reportData.rows as ProductReportRow[]).map((row) => (
        <tr key={`${row.productId}-${row.sku}`}>
          <td>{row.sku || '-'}</td>
          <td>{row.productName}</td>
          <td>{row.transactions}</td>
          <td>{row.unitsSold}</td>
          <td className="reports-amount">Rs {row.revenue.toLocaleString()}</td>
        </tr>
      ));
    }

    return (reportData.rows as StoreReportRow[]).map((row) => (
      <tr key={`${row.storeId || 'none'}-${row.storeName}`}>
        <td>{row.storeName}</td>
        <td>{row.transactions}</td>
        <td>{row.unitsSold}</td>
        <td className="reports-amount">Rs {row.revenue.toLocaleString()}</td>
      </tr>
    ));
  };

  const renderHeaders = () => {
    if (reportType === 'sales') {
      return (
        <tr>
          <th>Date</th>
          <th>Transactions</th>
          <th>Units Sold</th>
          <th>Revenue</th>
        </tr>
      );
    }

    if (reportType === 'product') {
      return (
        <tr>
          <th>SKU</th>
          <th>Product</th>
          <th>Transactions</th>
          <th>Units Sold</th>
          <th>Revenue</th>
        </tr>
      );
    }

    return (
      <tr>
        <th>Store</th>
        <th>Transactions</th>
        <th>Units Sold</th>
        <th>Revenue</th>
      </tr>
    );
  };

  return (
    <div className="reports-page">
      <div className="reports-topbar">
        <div>
          <h1>Reports Module</h1>
          <p>Analytics workspace for Admin and Manager. Signed in as {user.name}.</p>
        </div>
        <div className="reports-sync">
          <span className={`reports-sync-dot ${loading ? 'is-loading' : ''}`}></span>
          {lastSyncedAt ? `Last synced ${lastSyncedAt}` : 'No sync data'}
        </div>
      </div>

      <section className="reports-hero card">
        <div>
          <p className="reports-kicker">Performance Intelligence</p>
          <h2 className="reports-hero-title">{reportType.charAt(0).toUpperCase() + reportType.slice(1)} Insights</h2>
          <p className="reports-hero-subtitle">
            Live overview for {periodLabelMap[period]}{period === 'custom' ? ` (${fromDate} to ${toDate})` : ''}.
          </p>
        </div>
        <div className="reports-hero-pill">Rows: {reportData?.rows.length || 0}</div>
      </section>

      <section className="reports-kpi-grid">
        <article className="reports-kpi-card tone-primary">
          <p>Revenue</p>
          <h3>Rs {Math.round(summary.totalRevenue).toLocaleString()}</h3>
          <span>Total value in selected range</span>
        </article>
        <article className="reports-kpi-card tone-teal">
          <p>Transactions</p>
          <h3>{summary.totalTransactions.toLocaleString()}</h3>
          <span>Completed billing entries</span>
        </article>
        <article className="reports-kpi-card tone-amber">
          <p>Units Sold</p>
          <h3>{summary.totalUnits.toLocaleString()}</h3>
          <span>Item quantity moved</span>
        </article>
        <article className="reports-kpi-card tone-indigo">
          <p>Avg Ticket</p>
          <h3>Rs {Math.round(summary.averageTicket).toLocaleString()}</h3>
          <span>{summary.topLabel}</span>
        </article>
      </section>

      {summary.topRevenue > 0 && (
        <div className="reports-highlight card">
          <strong>{summary.topLabel}</strong>
          <span>Revenue: Rs {Math.round(summary.topRevenue).toLocaleString()}</span>
        </div>
      )}

      <div className="reports-filters card">
        <div className="reports-grid">
          <div>
            <label>Report Type</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="form-input">
              <option value="sales">Sales Report</option>
              <option value="product">Product-wise Report</option>
              <option value="store">Store-wise Report</option>
            </select>
          </div>

          <div>
            <label>Time Filter</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value as ReportPeriod)} className="form-input">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          <div>
            <label>Store</label>
            <select value={store} onChange={(e) => setStore(e.target.value)} className="form-input">
              <option value="">All Stores</option>
              {stores.map((entry) => (
                <option key={entry.id} value={String(entry.id)}>{entry.name}</option>
              ))}
            </select>
          </div>

          {period === 'custom' && (
            <>
              <div>
                <label>From</label>
                <input className="form-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <label>To</label>
                <input className="form-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className="reports-actions">
          <button className="btn btn-secondary reports-btn" onClick={() => void loadReportData()} disabled={loading}>Refresh</button>
          <button className="btn btn-primary reports-btn" onClick={() => void handleDownload('csv')} disabled={exporting !== null}>
            {exporting === 'csv' ? 'Preparing CSV...' : 'Export CSV'}
          </button>
          <button className="btn btn-primary reports-btn" onClick={() => void handleDownload('xlsx')} disabled={exporting !== null}>
            {exporting === 'xlsx' ? 'Preparing Excel...' : 'Export Excel'}
          </button>
        </div>
      </div>

      {loading && <p className="reports-status">Loading report data...</p>}
      {error && <p className="reports-error">{error}</p>}

      <div className="card reports-table-wrap">
        <table className="reports-table">
          <thead>{renderHeaders()}</thead>
          <tbody>{renderRows()}</tbody>
        </table>
      </div>
    </div>
  );
};

export default Reports;
