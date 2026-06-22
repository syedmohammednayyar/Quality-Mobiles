import React, { useEffect, useMemo, useState } from 'react';
import { User } from '../types';
import { listSales, listStores, type ApiSale, type ApiStore } from '../services/api';
import './Sales.css';

type SaleRow = {
  key: string;
  sale: ApiSale;
  item: ApiSale['items'][number];
};

const Sales: React.FC<{ user: User }> = ({ user }) => {
  const [sales, setSales] = useState<ApiSale[]>([]);
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener('sales:changed', refresh);
    const interval = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('sales:changed', refresh);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError('');
        const [saleRows, storeRows] = await Promise.all([listSales(), listStores()]);
        setSales(saleRows);
        setStores(storeRows.filter((store) => store.is_active));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sales');
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshKey]);

  const rows = useMemo<SaleRow[]>(() => sales.flatMap((sale) =>
    sale.items.map((item, index) => ({ key: `${sale.id}-${item.id || item.product}-${index}`, sale, item }))
  ), [sales]);

  const employees = useMemo(() => [...new Set(sales.map((sale) => sale.employee_name).filter(Boolean))].sort(), [sales]);
  const paymentMethods = useMemo(() => [...new Set(sales.map((sale) => sale.payment_method).filter(Boolean))].sort(), [sales]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
    return rows.filter(({ sale, item }) => {
      const soldAt = new Date(sale.sold_at);
      const searchOk = !query || [
        sale.sale_no,
        sale.id,
        item.job_no,
        item.imei,
        item.product_name,
        item.brand,
        sale.customer_name,
      ].some((value) => String(value || '').toLowerCase().includes(query));
      return searchOk
        && (storeFilter === 'all' || sale.store_ref === storeFilter)
        && (employeeFilter === 'all' || sale.employee_name === employeeFilter)
        && (paymentFilter === 'all' || sale.payment_method === paymentFilter)
        && (statusFilter === 'all' || sale.payment_status === statusFilter)
        && (!from || soldAt >= from)
        && (!to || soldAt <= to);
    });
  }, [rows, search, storeFilter, employeeFilter, paymentFilter, statusFilter, fromDate, toDate]);

  return (
    <div className="sales-page">
      <header className="sales-header">
        <div><h1>Sales History</h1><p>{filteredRows.length} sold products | {user.role}</p></div>
        <strong>Rs {filteredRows.reduce((sum, row) => sum + Number(row.item.line_total || row.item.unit_price || 0), 0).toLocaleString()}</strong>
      </header>

      <section className="sales-filters">
        <label className="sales-search"><span className="material-icons">search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sale ID, job number, IMEI, customer or product" /></label>
        <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} disabled={user.role !== 'Admin'}><option value="all">All Stores</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select>
        <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}><option value="all">All Employees</option>{employees.map((employee) => <option key={employee} value={employee}>{employee}</option>)}</select>
        <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}><option value="all">All Payments</option>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All Statuses</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="pending">Pending</option></select>
        <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} title="From date" />
        <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} title="To date" />
      </section>

      {error && <p className="sales-state sales-state-error">{error}</p>}

      <section className="sales-table-wrap">
        <table className="sales-table-modern">
          <thead><tr><th>Sale ID</th><th>Job Number</th><th>Product</th><th>IMEI</th><th>Customer</th><th>Store</th><th>Employee</th><th>Payment</th><th>Amount</th><th>Sale Date</th><th>Status</th></tr></thead>
          <tbody>
            {filteredRows.map(({ key, sale, item }) => (
              <tr key={key}>
                <td><strong>{sale.sale_no || sale.id}</strong></td>
                <td>{item.job_no || sale.job_no || '-'}</td>
                <td><strong>{item.product_name || '-'}</strong><span>{item.brand || ''}</span></td>
                <td>{item.imei || '-'}</td>
                <td>{sale.customer_name || 'Walk-in'}</td>
                <td>{sale.store_name || '-'}</td>
                <td>{sale.employee_name || sale.salesperson_name || '-'}</td>
                <td>{sale.payment_method || '-'}</td>
                <td>
                  <strong>Rs {Number(item.line_total || item.unit_price || 0).toLocaleString()}</strong>
                  {Number(item.original_price) > 0 && Number(item.original_price) !== Number(item.unit_price) && (
                    <span className="sales-list-price">List: Rs {Number(item.original_price).toLocaleString()}</span>
                  )}
                </td>
                <td>{new Date(sale.sold_at).toLocaleString()}</td>
                <td><span className={`sales-status ${sale.payment_status || 'pending'}`}>{sale.payment_status || sale.sale_status || 'completed'}</span></td>
              </tr>
            ))}
            {!loading && filteredRows.length === 0 && <tr><td colSpan={11} className="sales-empty">No completed sales found.</td></tr>}
            {loading && <tr><td colSpan={11} className="sales-empty">Loading sales...</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default Sales;
