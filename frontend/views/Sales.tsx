import React, { useEffect, useMemo, useState } from 'react';
import { User } from '../types';
import { getSaleDetail, listSales, listStores, type ApiSale, type ApiSaleDetail, type ApiStore } from '../services/api';
import './Sales.css';

const money = (value: number | string) => `Rs ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

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
  const [viewSaleId, setViewSaleId] = useState<string | null>(null);
  const [viewDetail, setViewDetail] = useState<ApiSaleDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');

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

  useEffect(() => {
    if (!viewSaleId) { setViewDetail(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        setViewLoading(true);
        setViewError('');
        const detail = await getSaleDetail(viewSaleId);
        if (!cancelled) setViewDetail(detail);
      } catch (err) {
        if (!cancelled) setViewError(err instanceof Error ? err.message : 'Failed to load sale details');
      } finally {
        if (!cancelled) setViewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewSaleId]);

  return (
    <div className="sales-page">
      <header className="module-header sales-header">
        <div><h1>Sales History</h1><p>{filteredRows.length} sold products &middot; exchange and adjustments shown separately</p></div>
        <strong>Rs {filteredRows.reduce((sum, row) => sum + Number(row.sale.total_amount || row.item.line_total || row.item.unit_price || 0), 0).toLocaleString()}</strong>
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
          <thead><tr><th>Sale ID</th><th>Job Number</th><th>Product</th><th>IMEI</th><th>Customer</th><th>Store</th><th>Employee</th><th>Price Breakdown</th><th>Payment</th><th>Sale Date</th><th>Status</th><th></th></tr></thead>
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
                <td>
                  <strong>Rs {Number(sale.original_amount || item.original_price || item.unit_price || 0).toLocaleString()}</strong>
                  <span className="sales-list-price">Exchange: −Rs {Number(sale.exchange_total || 0).toLocaleString()}</span>
                  <span className="sales-list-price">Other adj.: −Rs {Number(sale.price_adjustment_total || 0).toLocaleString()}</span>
                  <span className="sales-list-price">Final: Rs {Number(sale.total_amount || item.line_total || item.unit_price || 0).toLocaleString()}</span>
                </td>
                <td>{sale.payment_method || '-'}</td>
                <td>{new Date(sale.sold_at).toLocaleString()}</td>
                <td><span className={`sales-status ${sale.payment_status || 'pending'}`}>{sale.payment_status || sale.sale_status || 'completed'}</span></td>
                <td><button type="button" className="sales-view-btn" onClick={() => setViewSaleId(sale.id)}>View</button></td>
              </tr>
            ))}
            {!loading && filteredRows.length === 0 && <tr><td colSpan={12} className="sales-empty">
              <strong>No sales found</strong>
              <span>No completed sales match the selected filters. Try changing the date range, store or search.</span>
            </td></tr>}
            {loading && <tr><td colSpan={12} className="sales-empty">Loading sales...</td></tr>}
          </tbody>
        </table>
      </section>

      {viewSaleId && (
        <div className="sales-drawer-overlay" onClick={() => setViewSaleId(null)}>
          <div className="sales-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="sales-drawer-head">
              <h2>Sale Details</h2>
              <button type="button" onClick={() => setViewSaleId(null)} aria-label="Close">×</button>
            </div>

            {viewLoading && <p className="sales-state">Loading sale details...</p>}
            {viewError && <p className="sales-state sales-state-error">{viewError}</p>}

            {viewDetail && !viewLoading && (
              <div className="sales-drawer-body">
                <p className="sales-drawer-id">{viewDetail.sale_no} &middot; {new Date(viewDetail.created_at).toLocaleString()}</p>

                <dl>
                  <dt>Store</dt><dd>{viewDetail.store_name}</dd>
                  <dt>Employee</dt><dd>{viewDetail.employee_name}</dd>
                  <dt>Customer</dt><dd>{viewDetail.customer_name}{viewDetail.customer_phone ? ` (${viewDetail.customer_phone})` : ''}</dd>
                  <dt>Status</dt><dd><span className={`sales-status ${viewDetail.payment_status}`}>{viewDetail.payment_status}</span></dd>
                  {viewDetail.attended_by_name && <><dt>Attended By</dt><dd>{viewDetail.attended_by_name}</dd></>}
                  {viewDetail.referred_by_name && <><dt>Referred By</dt><dd>{viewDetail.referred_by_name}</dd></>}
                  {viewDetail.job_number && <><dt>Job Number</dt><dd>{viewDetail.job_number}</dd></>}
                  {viewDetail.ic_number && <><dt>IC Number</dt><dd>{viewDetail.ic_number}</dd></>}
                  {viewDetail.gift && <><dt>Gift</dt><dd>{viewDetail.gift}</dd></>}
                </dl>

                <h3>Items</h3>
                <div className="sales-drawer-items">
                  {viewDetail.items.map((item) => (
                    <div key={item.id} className={`sales-drawer-item${item.is_loss ? ' loss' : ''}`}>
                      <div className="sales-drawer-item-head">
                        <strong>{item.product_name}</strong>
                        <span>{item.brand} {item.model}</span>
                        <span>{item.imei || item.job_id || item.sku || '-'}</span>
                      </div>
                      <div className="sales-drawer-item-grid">
                        <div><span>Qty</span><strong>{item.quantity}</strong></div>
                        <div><span>Original Price</span><strong>{money(item.original_unit_price)}</strong></div>
                        <div><span>Sold Price</span><strong>{money(item.adjusted_unit_price)}</strong></div>
                        <div><span>Line Total</span><strong>{money(item.line_total)}</strong></div>
                        <div><span>Cost Basis</span><strong>{money(item.cost_basis)}</strong></div>
                        <div><span>Result</span><strong className={item.is_loss ? 'loss' : 'profit'}>{item.is_loss ? `− ${money(Math.abs(Number(item.gross_result)))} Loss` : `+ ${money(Math.abs(Number(item.gross_result)))} Profit`}</strong></div>
                      </div>
                      {item.price_was_adjusted && <p className="sales-drawer-item-note">Price adjusted{item.adjustment_category ? ` (${item.adjustment_category})` : ''}{item.adjustment_reason ? `: ${item.adjustment_reason}` : ''}</p>}
                    </div>
                  ))}
                </div>

                <h3>Payments</h3>
                <div className="sales-drawer-payments">
                  {viewDetail.payments.length === 0 && <p className="sales-drawer-item-note">No payment records.</p>}
                  {viewDetail.payments.map((payment) => (
                    <div key={payment.id} className="sales-drawer-payment-row">
                      <span>{payment.method}</span>
                      <span>{money(payment.amount)}</span>
                      <span className={`sales-status ${payment.status}`}>{payment.status}</span>
                    </div>
                  ))}
                </div>

                <h3>Totals</h3>
                <div className="sales-drawer-financials">
                  <div><span>Original Amount</span><strong>{money(viewDetail.original_amount)}</strong></div>
                  <div><span>Price Adjustment</span><strong>{money(viewDetail.price_adjustment_total)}</strong></div>
                  <div><span>Discount</span><strong>{money(viewDetail.discount_total)}</strong></div>
                  <div><span>Exchange</span><strong>{money(viewDetail.exchange_total)}</strong></div>
                  <div><span>Tax</span><strong>{money(viewDetail.tax_total)}</strong></div>
                  <div className="highlight"><span>Grand Total</span><strong>{money(viewDetail.grand_total)}</strong></div>
                  <div><span>Amount Paid</span><strong>{money(viewDetail.amount_paid)}</strong></div>
                </div>

                {viewDetail.note && <p className="sales-drawer-item-note">Note: {viewDetail.note}</p>}
                {viewDetail.referral_notes && <p className="sales-drawer-item-note">Referral: {viewDetail.referral_notes}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Sales;
