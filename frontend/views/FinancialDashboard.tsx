import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, isPrivilegedUser } from '../types';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  downloadBriefReportCSV,
  listExpenses,
  listPaymentEntries,
  listBuybacks,
  listProducts,
  listRepairs,
  listSales,
  listStores,
  type ApiBuyback,
  type ApiExpense,
  type ApiPaymentEntry,
  type ApiProduct,
  type ApiRepairTicket,
  type ApiSale,
  type ApiStore
} from '../services/api';
import './FinancialDashboard.css';

const monthLabel = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short' });

const inRange = (dateIso: string, timeRange: string): boolean => {
  const now = new Date();
  const d = new Date(dateIso);
  const msDay = 24 * 60 * 60 * 1000;
  const diffDays = (now.getTime() - d.getTime()) / msDay;

  if (timeRange === 'Day') return diffDays <= 1;
  if (timeRange === 'Week') return diffDays <= 7;
  if (timeRange === 'Month') return diffDays <= 31;
  if (timeRange === 'Quarter') return diffDays <= 92;
  return diffDays <= 366;
};

const FinancialDashboard: React.FC<{ user: User }> = ({ user }) => {
  const [searchParams] = useSearchParams();
  const globalStore = searchParams.get('store') || 'All Stores';

  const [timeRange, setTimeRange] = useState('Month');
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [sales, setSales] = useState<ApiSale[]>([]);
  const [buybacks, setBuybacks] = useState<ApiBuyback[]>([]);
  const [repairs, setRepairs] = useState<ApiRepairTicket[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [expenses, setExpenses] = useState<ApiExpense[]>([]);
  const [paymentEntries, setPaymentEntries] = useState<ApiPaymentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportMode, setReportMode] = useState<'days' | 'month'>('month');
  const [reportFrom, setReportFrom] = useState(new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10));
  const [reportTo, setReportTo] = useState(new Date().toISOString().slice(0, 10));
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [downloadingSection, setDownloadingSection] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [st, s, b, r, p, e, pay] = await Promise.all([listStores(), listSales(), listBuybacks(), listRepairs(), listProducts(), listExpenses(), listPaymentEntries()]);
        setStores(st);
        setSales(s);
        setBuybacks(b);
        setRepairs(r);
        setProducts(p);
        setExpenses(e);
        setPaymentEntries(pay);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load financial reports');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const selectedStoreId = useMemo(() => stores.find((s) => s.name === globalStore)?.id, [stores, globalStore]);

  const salesByStore = useMemo(() => {
    if (globalStore === 'All Stores') return sales;
    return sales.filter((entry) => entry.store_ref === selectedStoreId);
  }, [sales, globalStore, selectedStoreId]);

  const buybacksByStore = useMemo(() => {
    if (globalStore === 'All Stores') return buybacks;
    return buybacks.filter((entry) => entry.store_ref === selectedStoreId);
  }, [buybacks, globalStore, selectedStoreId]);

  const repairsByStore = useMemo(() => {
    if (globalStore === 'All Stores') return repairs;
    return repairs.filter((entry) => entry.store_ref === selectedStoreId);
  }, [repairs, globalStore, selectedStoreId]);

  const productsByStore = useMemo(() => {
    if (globalStore === 'All Stores') return products;
    return products.filter((entry) => entry.primary_store_ref === selectedStoreId);
  }, [products, globalStore, selectedStoreId]);

  const expensesByStore = useMemo(() => {
    if (globalStore === 'All Stores') return expenses;
    return expenses.filter((entry) => entry.store_ref === selectedStoreId);
  }, [expenses, globalStore, selectedStoreId]);

  const paymentsByStore = useMemo(() => {
    if (globalStore === 'All Stores') return paymentEntries;
    return paymentEntries.filter((entry) => entry.store_ref === selectedStoreId);
  }, [paymentEntries, globalStore, selectedStoreId]);

  const filteredSales = useMemo(() => salesByStore.filter((s) => inRange(s.sold_at, timeRange)), [salesByStore, timeRange]);
  const filteredBuybacks = useMemo(() => buybacksByStore.filter((b) => inRange(b.created_at, timeRange)), [buybacksByStore, timeRange]);
  const filteredRepairs = useMemo(() => repairsByStore.filter((r) => inRange(r.created_at, timeRange)), [repairsByStore, timeRange]);
  const filteredExpenses = useMemo(() => expensesByStore.filter((entry) => inRange(entry.expense_date, timeRange)), [expensesByStore, timeRange]);
  const filteredPayments = useMemo(() => paymentsByStore.filter((entry) => inRange(entry.entry_date, timeRange)), [paymentsByStore, timeRange]);

  const cashflowData = useMemo(() => {
    const months = new Map<string, { month: string; revenue: number; expenses: number; profit: number }>();
    filteredSales.forEach((sale) => {
      const key = new Date(sale.sold_at).toISOString().slice(0, 7);
      const prev = months.get(key) || { month: monthLabel(sale.sold_at), revenue: 0, expenses: 0, profit: 0 };
      prev.revenue += Number(sale.total_amount || 0);
      months.set(key, prev);
    });

    filteredExpenses.forEach((entry) => {
      const key = new Date(entry.expense_date).toISOString().slice(0, 7);
      const prev = months.get(key) || { month: monthLabel(entry.expense_date), revenue: 0, expenses: 0, profit: 0 };
      prev.expenses += Number(entry.out_cash || 0) + Number(entry.out_online || 0);
      months.set(key, prev);
    });

    filteredBuybacks.forEach((entry) => {
      const key = new Date(entry.created_at).toISOString().slice(0, 7);
      const prev = months.get(key) || { month: monthLabel(entry.created_at), revenue: 0, expenses: 0, profit: 0 };
      prev.expenses += 0;
      months.set(key, prev);
    });

    filteredRepairs.forEach((entry) => {
      const key = new Date(entry.created_at).toISOString().slice(0, 7);
      const prev = months.get(key) || { month: monthLabel(entry.created_at), revenue: 0, expenses: 0, profit: 0 };
      prev.revenue += Number(entry.labor_cost || 0);
      months.set(key, prev);
    });

    return Array.from(months.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([, value]) => ({ ...value, profit: value.revenue - value.expenses }));
  }, [filteredSales, filteredBuybacks, filteredRepairs, filteredExpenses]);

  const receivablesData = useMemo(() => {
    const pendingRepairs = filteredRepairs.filter((entry) => entry.status !== 'Delivered');
    const pendingAmount = filteredPayments.filter((entry) => entry.entry_type === 'in').reduce((sum, entry) => sum + Number(entry.cash_amount || 0) + Number(entry.online_amount || 0), 0);
    return [
      { range: 'Current', amount: pendingAmount, count: filteredPayments.filter((entry) => entry.entry_type === 'in').length },
      { range: '30-60 Days', amount: 0, count: 0 },
      { range: '60-90 Days', amount: 0, count: 0 },
      { range: '90+ Days', amount: 0, count: 0 },
    ];
  }, [filteredPayments]);

  const payablesData = useMemo(() => {
    const outEntries = filteredPayments.filter((entry) => entry.entry_type === 'out');
    const amount = outEntries.reduce((sum, entry) => sum + Number(entry.cash_amount || 0) + Number(entry.online_amount || 0), 0);
    return [
      { range: 'Current', amount, count: outEntries.length },
      { range: '30-60 Days', amount: 0, count: 0 },
      { range: '60-90 Days', amount: 0, count: 0 },
      { range: '90+ Days', amount: 0, count: 0 },
    ];
  }, [filteredPayments]);

  const storeProfit = useMemo(() => {
    if (globalStore !== 'All Stores') {
      const rev = cashflowData.reduce((sum, month) => sum + month.revenue, 0);
      const prof = cashflowData.reduce((sum, month) => sum + month.profit, 0);
      return [{ name: globalStore, revenue: rev, target: Math.round(rev * 1.1), profit: prof }];
    }

    return stores.map((store) => {
      const revenue = sales.filter((entry) => entry.store_ref === store.id).reduce((sum, entry) => sum + Number(entry.total_amount || 0), 0);
      const expensesTotal = expenses.filter((entry) => entry.store_ref === store.id).reduce((sum, entry) => sum + Number(entry.out_cash || 0) + Number(entry.out_online || 0), 0);
      return {
        name: store.name,
        revenue,
        target: Math.round(revenue * 1.1),
        profit: revenue - expensesTotal,
      };
    });
  }, [globalStore, cashflowData, stores, sales, expenses]);

  const metrics = useMemo(() => {
    const revenue = cashflowData.reduce((sum, month) => sum + month.revenue, 0);
    const expenses = cashflowData.reduce((sum, month) => sum + month.expenses, 0);
    const profit = revenue - expenses;
    const receivables = receivablesData.reduce((sum, item) => sum + item.amount, 0);
    const stockValue = productsByStore.reduce((sum, product) => sum + Number(product.price) * product.stock_quantity, 0);
    return { revenue, expenses, profit, receivables, stockValue };
  }, [cashflowData, receivablesData, productsByStore]);

  const kpis = [
    { label: 'Revenue', value: `Rs ${Math.round(metrics.revenue).toLocaleString()}`, trend: `${filteredSales.length} sales`, bg: 'linear-gradient(135deg, var(--primary) 0%, #1e40af 100%)' },
    { label: 'Expenses', value: `Rs ${Math.round(metrics.expenses).toLocaleString()}`, trend: `${filteredBuybacks.length} buybacks`, bg: 'linear-gradient(135deg, var(--warning) 0%, #f97316 100%)' },
    { label: 'Net Profit', value: `Rs ${Math.round(metrics.profit).toLocaleString()}`, trend: `${filteredRepairs.length} repairs`, bg: 'linear-gradient(135deg, var(--success) 0%, #059669 100%)' },
    { label: 'Receivables', value: `Rs ${Math.round(metrics.receivables).toLocaleString()}`, trend: `Stock Rs ${Math.round(metrics.stockValue).toLocaleString()}`, bg: 'linear-gradient(135deg, var(--teal) 0%, #0f766e 100%)' },
  ];

  const handleDownloadBriefReport = async (section: string) => {
    try {
      setDownloadingSection(section);
      setError('');
      const params = reportMode === 'month'
        ? { month: reportMonth }
        : { from: reportFrom, to: reportTo };
      const blob = await downloadBriefReportCSV({
        ...params,
        store: globalStore !== 'All Stores' ? globalStore : undefined,
        section,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const label = reportMode === 'month' ? reportMonth : `${reportFrom}_to_${reportTo}`;
      a.href = url;
      a.download = `${section}_report_${label}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download report');
    } finally {
      setDownloadingSection(null);
    }
  };

  if (!isPrivilegedUser(user)) {
    return (
      <div className="financial-container financial-page">
        <div className="financial-header card financial-hero">
          <div>
            <h1>Financial Dashboard</h1>
            <p>Track revenue, expenses, and profitability trends across selected periods.</p>
          </div>
          <div className="time-selector">
            {['Day', 'Week', 'Month', 'Quarter', 'Year'].map((range) => (
              <button key={range} className={`time-btn ${timeRange === range ? 'active' : ''}`} onClick={() => setTimeRange(range)}>{range}</button>
            ))}
          </div>
        </div>

        {loading && <p className="financial-state">Loading reports...</p>}
        {error && <p className="financial-state financial-state-error">{error}</p>}

        <div className="kpi-grid">
          {kpis.map((kpi, index) => (
            <div key={index} className="kpi-card-fin" style={{ background: kpi.bg }}>
              <div className="kpi-content"><p className="kpi-label">{kpi.label}</p><h2 className="kpi-value">{kpi.value}</h2><span className="kpi-trend">{kpi.trend}</span></div>
            </div>
          ))}
        </div>

        <div className="charts-grid">
          <div className="chart-card chart-lg">
            <div className="chart-header"><h3>Cash Flow Trend</h3><span className="chart-info">{globalStore} | {timeRange}</span></div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={cashflowData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8} /><stop offset="95%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--warning)" stopOpacity={0.8} /><stop offset="95%" stopColor="var(--warning)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" />
                <YAxis stroke="var(--text-secondary)" />
                <Tooltip contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }} />
                <Legend />
                <Area type="monotone" dataKey="revenue" stroke="var(--primary)" fillOpacity={1} fill="url(#colorRevenue)" name="Revenue" />
                <Area type="monotone" dataKey="expenses" stroke="var(--warning)" fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <div className="chart-header"><h3>Store Profitability</h3></div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={storeProfit}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="name" stroke="var(--text-secondary)" />
                <YAxis stroke="var(--text-secondary)" />
                <Tooltip contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }} />
                <Legend />
                <Bar dataKey="revenue" fill="var(--primary)" name="Revenue" />
                <Bar dataKey="profit" fill="var(--success)" name="Profit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="financial-container financial-page">
      <div className="financial-header card financial-hero">
        <div>
          <h1>Reports Center</h1>
          <p>Download section-wise operational reports and monitor financial movement.</p>
        </div>
        <div className="time-selector">
          {['Day', 'Week', 'Month', 'Quarter', 'Year'].map((range) => (
            <button key={range} className={`time-btn ${timeRange === range ? 'active' : ''}`} onClick={() => setTimeRange(range)}>{range}</button>
          ))}
        </div>
      </div>

      {loading && <p className="financial-state">Loading reports...</p>}
      {error && <p className="financial-state financial-state-error">{error}</p>}

      <div className="chart-card report-download-card">
        <div className="chart-header"><h3>Module Report Downloads</h3><span className="chart-info">{globalStore}</span></div>
        <div className="report-controls">
          <div className="report-mode-switch">
            <button className={`time-btn ${reportMode === 'month' ? 'active' : ''}`} onClick={() => setReportMode('month')}>By Month</button>
            <button className={`time-btn ${reportMode === 'days' ? 'active' : ''}`} onClick={() => setReportMode('days')}>By Day Range</button>
          </div>

          {reportMode === 'month' ? (
            <input type="month" className="time-btn report-input" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
          ) : (
            <div className="report-range-row">
              <input type="date" className="time-btn report-input" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
              <input type="date" className="time-btn report-input" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
            </div>
          )}

          <div className="report-download-grid">
            {[
              { key: 'overall', label: 'Overall Report' },
              { key: 'sales', label: 'Sales Report' },
              { key: 'accessories', label: 'Accessories Report' },
              { key: 'buybacks', label: 'Buybacks Report' },
              { key: 'repairs', label: 'Repairs Report' },
              { key: 'expenses', label: 'Expenses Report' },
              { key: 'payments', label: 'Payments Report' },
              { key: 'inventory', label: 'Inventory Report' },
              { key: 'customers', label: 'Customers Report' },
            ].map((section) => (
              <button key={section.key} className="time-btn active report-download-btn" onClick={() => void handleDownloadBriefReport(section.key)} disabled={downloadingSection !== null}>
                {downloadingSection === section.key ? 'Preparing CSV...' : section.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((kpi, index) => (
          <div key={index} className="kpi-card-fin" style={{ background: kpi.bg }}>
            <div className="kpi-content"><p className="kpi-label">{kpi.label}</p><h2 className="kpi-value">{kpi.value}</h2><span className="kpi-trend">{kpi.trend}</span></div>
          </div>
        ))}
      </div>

      <div className="charts-grid">
        <div className="chart-card chart-lg">
          <div className="chart-header"><h3>Cash Flow Trend</h3><span className="chart-info">{globalStore} | {timeRange}</span></div>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={cashflowData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8} /><stop offset="95%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient>
                <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--warning)" stopOpacity={0.8} /><stop offset="95%" stopColor="var(--warning)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="month" stroke="var(--text-secondary)" />
              <YAxis stroke="var(--text-secondary)" />
              <Tooltip contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }} />
              <Legend />
              <Area type="monotone" dataKey="revenue" stroke="var(--primary)" fillOpacity={1} fill="url(#colorRevenue)" name="Revenue" />
              <Area type="monotone" dataKey="expenses" stroke="var(--warning)" fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-header"><h3>Store Profitability</h3></div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={storeProfit}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="name" stroke="var(--text-secondary)" />
              <YAxis stroke="var(--text-secondary)" />
              <Tooltip contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }} />
              <Legend />
              <Bar dataKey="revenue" fill="var(--primary)" name="Revenue" />
              <Bar dataKey="profit" fill="var(--success)" name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="aging-grid">
        <div className="aging-card">
          <h3>Receivables Aging</h3>
          <table className="aging-table"><thead><tr><th>Period</th><th>Amount</th><th>Invoices</th></tr></thead><tbody>{receivablesData.map((item, index) => <tr key={index}><td className="period-cell">{item.range}</td><td className="amount-cell">Rs {item.amount.toLocaleString()}</td><td className="count-cell badge">{item.count}</td></tr>)}</tbody></table>
          <div className="total-row"><strong>Total Receivables</strong><strong>Rs {receivablesData.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}</strong></div>
        </div>

        <div className="aging-card">
          <h3>Payables Aging</h3>
          <table className="aging-table"><thead><tr><th>Period</th><th>Amount</th><th>Bills</th></tr></thead><tbody>{payablesData.map((item, index) => <tr key={index}><td className="period-cell">{item.range}</td><td className="amount-cell">Rs {item.amount.toLocaleString()}</td><td className="count-cell badge">{item.count}</td></tr>)}</tbody></table>
          <div className="total-row"><strong>Total Payables</strong><strong>Rs {payablesData.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}</strong></div>
        </div>
      </div>
    </div>
  );
};

export default FinancialDashboard;
