import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { User, KpiData } from '../types';
import { listCustomers, listProducts, listSales, listStores, type ApiCustomer, type ApiProduct, type ApiSale, type ApiStore } from '../services/api';
import './Dashboard.css';

interface DashboardProps {
  user: User;
}

type RecentSale = {
  id: string;
  customer: string;
  amount: number;
  store: string;
  salesman: string;
  status: 'Completed' | 'Pending';
};

const categoryLabel: Record<string, string> = {
  new_phone: 'New Phones',
  used_phone: 'Used Phones',
  accessories: 'Accessories',
  services: 'Services',
};

const piePalette = ['#3284c8', '#14b8a6', '#f59e0b', '#10b981'];

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const [searchParams] = useSearchParams();
  const globalStore = searchParams.get('store') || 'All Stores';
  const query = (searchParams.get('q') || '').toLowerCase();

  const [sales, setSales] = useState<ApiSale[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [salesData, customersData, productsData, storesData] = await Promise.all([
          listSales(),
          listCustomers(),
          listProducts(),
          listStores(),
        ]);
        setSales(salesData);
        setProducts(productsData);
        setCustomers(customersData);
        setStores(storesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const lowStockCount = useMemo(() => products.filter((p) => p.stock_quantity < 5).length, [products]);

  const productsById = useMemo(() => {
    const map = new Map<number, ApiProduct>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const customerNameById = useMemo(() => {
    const map = new Map<number, string>();
    customers.forEach((customer) => map.set(customer.id, customer.name));
    return map;
  }, [customers]);

  const storeNameById = useMemo(() => {
    const map = new Map<number, string>();
    stores.forEach((store) => map.set(store.id, store.name));
    return map;
  }, [stores]);

  const getStoreFromSale = useCallback((sale: ApiSale): string => {
    if (sale.store_ref && storeNameById.has(sale.store_ref)) {
      return storeNameById.get(sale.store_ref) as string;
    }
    const noteMatch = sale.notes?.match(/store=([^|]+)/i);
    return noteMatch?.[1]?.trim() || 'Main Branch';
  }, [storeNameById]);

  const filteredSales = useMemo(() => {
    let list = sales;
    if (globalStore !== 'All Stores') {
      list = list.filter((s) => getStoreFromSale(s) === globalStore);
    }
    if (query) {
      list = list.filter((s) => {
        const store = getStoreFromSale(s).toLowerCase();
        const saleId = `sale${s.id}`;
        return store.includes(query) || saleId.includes(query) || (s.notes || '').toLowerCase().includes(query);
      });
    }
    return list;
  }, [sales, globalStore, query, getStoreFromSale]);

  const todaysRevenue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return filteredSales
      .filter((s) => s.sold_at.slice(0, 10) === today)
      .reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  }, [filteredSales]);

  const monthlyRevenue = useMemo(() => {
    const monthPrefix = new Date().toISOString().slice(0, 7);
    return filteredSales
      .filter((s) => s.sold_at.startsWith(monthPrefix))
      .reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  }, [filteredSales]);

  const recentSalesData = useMemo<RecentSale[]>(() => {
    return filteredSales.slice(0, 5).map((sale) => ({
      id: `#SALE${sale.id}`,
      customer: sale.customer ? customerNameById.get(sale.customer) || 'Walk-in' : 'Walk-in',
      amount: Number(sale.total_amount || 0),
      store: getStoreFromSale(sale),
      salesman: sale.salesperson_name || user.name,
      status: Number(sale.got_amount || sale.total_amount || 0) >= Number(sale.total_amount || 0) ? 'Completed' : 'Pending',
    }));
  }, [filteredSales, customerNameById, user.name, getStoreFromSale]);

  const salesTrendData = useMemo(() => {
    const result: Array<{ date: string; revenue: number; transactions: number }> = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const daySales = filteredSales.filter((s) => s.sold_at.slice(0, 10) === key);
      result.push({
        date: d.toLocaleDateString('en-US', { weekday: 'short' }),
        revenue: daySales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0),
        transactions: daySales.length,
      });
    }
    return result;
  }, [filteredSales]);

  const averageDailyRevenue = useMemo(() => {
    if (!salesTrendData.length) return 0;
    const total = salesTrendData.reduce((sum, day) => sum + day.revenue, 0);
    return total / salesTrendData.length;
  }, [salesTrendData]);

  const storeComparisonData = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredSales.forEach((s) => {
      const store = getStoreFromSale(s);
      grouped.set(store, (grouped.get(store) || 0) + Number(s.total_amount || 0));
    });
    return Array.from(grouped.entries()).map(([store, revenue]) => ({
      store,
      revenue,
      target: Math.round(revenue * 1.15),
    }));
  }, [filteredSales, getStoreFromSale]);

  const revenueBreakdownData = useMemo(() => {
    const totals = new Map<string, number>();
    filteredSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const product = productsById.get(item.product);
        const key = product?.category || 'new_phone';
        const line = Number(item.unit_price || 0) * item.quantity;
        totals.set(key, (totals.get(key) || 0) + line);
      });
    });

    const totalRevenue = Array.from(totals.values()).reduce((a, b) => a + b, 0);
    return Array.from(totals.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([key, amount], idx) => ({
      name: categoryLabel[key] || key,
      value: totalRevenue ? Math.round((amount / totalRevenue) * 100) : 0,
      color: piePalette[idx % piePalette.length],
      }));
  }, [filteredSales, productsById]);

  const activeStoreCount = useMemo(() => stores.filter((store) => store.is_active).length, [stores]);
  const pendingOrders = useMemo(() => recentSalesData.filter((sale) => sale.status === 'Pending').length, [recentSalesData]);
  const todayTrend = useMemo(() => {
    if (!averageDailyRevenue) return 0;
    return Math.round(((todaysRevenue - averageDailyRevenue) / averageDailyRevenue) * 100);
  }, [averageDailyRevenue, todaysRevenue]);
  const customerCount = customers.length;

  const kpiData: KpiData[] = [
    {
      label: "Today's Revenue",
      value: `Rs ${todaysRevenue.toLocaleString()}`,
      trend: Math.abs(todayTrend),
      trendDirection: todayTrend === 0 ? 'stable' : todayTrend > 0 ? 'up' : 'down',
      icon: 'RS',
      color: '#10b981',
      bgLight: '#d1fae5',
    },
    {
      label: 'Monthly Revenue',
      value: `Rs ${monthlyRevenue.toLocaleString()}`,
      trend: 12,
      trendDirection: 'up',
      icon: 'MR',
      color: '#2878b5',
      bgLight: '#d9eaf5',
    },
    {
      label: 'Total Orders',
      value: filteredSales.length,
      trend: 8,
      trendDirection: 'up',
      icon: 'OR',
      color: '#f59e0b',
      bgLight: '#fef3c7',
    },
    {
      label: 'Low Stock Items',
      value: lowStockCount,
      trend: lowStockCount > 0 ? lowStockCount : 0,
      trendDirection: lowStockCount > 0 ? 'down' : 'stable',
      icon: 'LS',
      color: '#ef4444',
      bgLight: '#fee2e2',
    },
    {
      label: 'Total Customers',
      value: customerCount,
      trend: 6,
      trendDirection: 'up',
      icon: 'CU',
      color: '#3b82f6',
      bgLight: '#dbeafe',
    },
    {
      label: 'Avg. Order Value',
      value: `Rs ${filteredSales.length ? Math.round(monthlyRevenue / filteredSales.length).toLocaleString() : 0}`,
      trend: 4,
      trendDirection: 'up',
      icon: 'AO',
      color: '#8b5cf6',
      bgLight: '#ede9fe',
    },
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">Welcome back, {user.name}</p>
        </div>
        <div><span className="store-filter">{globalStore}</span></div>
      </div>

      <div className="dashboard-hero card">
        <div className="hero-main">
          <span className="hero-kicker">Live Operations</span>
          <h2>Enterprise Command Overview</h2>
          <p>
            Real-time visibility into branch performance, order flow, and inventory health.
          </p>
          <div className="hero-chip-row">
            <span className="hero-chip">{activeStoreCount} Active Stores</span>
            <span className="hero-chip">{pendingOrders} Pending Orders</span>
            <span className="hero-chip">Top Mix: {revenueBreakdownData[0]?.name || 'N/A'}</span>
          </div>
        </div>

        <div className="hero-stat-grid">
          <div className="hero-stat-card">
            <p className="hero-stat-label">Revenue Pulse</p>
            <p className="hero-stat-value">Rs {Math.round(averageDailyRevenue).toLocaleString()}</p>
            <div className="hero-progress-track">
              <span
                className="hero-progress-fill"
                style={{ width: `${Math.max(16, Math.min(100, Math.round((monthlyRevenue / 800000) * 100)))}%` }}
              />
            </div>
          </div>

          <div className="hero-stat-card">
            <p className="hero-stat-label">Conversion Window</p>
            <p className="hero-stat-value">{Math.max(1, 100 - lowStockCount)}%</p>
            <div className="hero-progress-track">
              <span
                className="hero-progress-fill"
                style={{ width: `${Math.max(12, Math.min(100, 100 - lowStockCount))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {loading && <p className="state-banner">Loading dashboard...</p>}
      {error && <p className="state-banner state-error">{error}</p>}

      <div className="kpi-grid">
        {kpiData.map((kpi, idx) => (
          <div key={idx} className="kpi-card">
            <div className="kpi-header">
              <div className="kpi-icon" style={{ backgroundColor: kpi.bgLight }}><span>{kpi.icon}</span></div>
              <div className={`kpi-trend ${kpi.trendDirection || 'stable'}`}>
                <span>{kpi.trend ?? 0}%</span>
              </div>
            </div>
            <div className="kpi-content"><p className="kpi-label">{kpi.label}</p><h3 className="kpi-value">{kpi.value}</h3></div>
            <div className="kpi-sparkline"><ResponsiveContainer width="100%" height={40}><LineChart data={salesTrendData.map((s) => ({ v: s.revenue }))}><Line type="monotone" dataKey="v" stroke={kpi.color} strokeWidth={2} dot={false} isAnimationActive /></LineChart></ResponsiveContainer></div>
          </div>
        ))}
      </div>

      <div className="charts-section">
        <div className="chart-card chart-lg">
          <div className="chart-header"><div><h3 className="chart-title">Sales Trend</h3><p className="chart-subtitle">Revenue & Transaction Count</p></div></div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="date" stroke="var(--text-tertiary)" />
              <YAxis stroke="var(--text-tertiary)" />
              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#2878b5" name="Revenue (Rs)" strokeWidth={2} />
              <Line type="monotone" dataKey="transactions" stroke="#14b8a6" name="Transactions" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card chart-md">
          <div className="chart-header"><div><h3 className="chart-title">Store Performance</h3><p className="chart-subtitle">Revenue vs Target</p></div></div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={storeComparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="store" stroke="var(--text-tertiary)" />
              <YAxis stroke="var(--text-tertiary)" />
              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }} />
              <Legend />
              <Bar dataKey="revenue" fill="#2878b5" name="Actual Revenue" />
              <Bar dataKey="target" fill="#cbd5e1" name="Target" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card chart-md">
          <div className="chart-header"><div><h3 className="chart-title">Revenue Mix</h3><p className="chart-subtitle">By Category</p></div></div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={revenueBreakdownData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                {revenueBreakdownData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pie-legend">{revenueBreakdownData.map((item, idx) => <div key={idx} className="pie-legend-item"><div className="pie-color" style={{ backgroundColor: item.color }}></div><span>{item.name}</span><span className="pie-value">{item.value}%</span></div>)}</div>
        </div>
      </div>

      <div className="bottom-section">
        <div className="list-card">
          <div className="card-header"><h3 className="card-title">Recent Sales</h3></div>
          <table className="sales-table">
            <thead><tr><th>Sale #</th><th>Customer</th><th>Amount</th><th>Store</th><th>Salesman</th><th>Status</th></tr></thead>
            <tbody>
              {recentSalesData.map((sale) => (
                <tr key={sale.id}>
                  <td className="job-id">{sale.id}</td><td>{sale.customer}</td><td className="amount">Rs {sale.amount.toLocaleString()}</td><td>{sale.store}</td><td>{sale.salesman}</td>
                  <td><span className={`status-badge ${sale.status.toLowerCase()}`}>{sale.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
