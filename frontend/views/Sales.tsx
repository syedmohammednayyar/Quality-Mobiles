import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, isPrivilegedUser } from '../types';
import {
  createSale,
  deleteSale,
  listCustomers,
  listProducts,
  listSales,
  listStores,
  updateSale,
  type ApiCustomer,
  type ApiProduct,
  type ApiSale,
  type ApiStore,
} from '../services/api';
import './Sales.css';

const Sales: React.FC<{ user: User }> = ({ user }) => {
  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' };
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').toLowerCase();
  const storeFilter = searchParams.get('store') || 'All Stores';

  const [sales, setSales] = useState<ApiSale[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [pendingDeleteSaleId, setPendingDeleteSaleId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    customer: '',
    cash_amount: '0',
    online_amount: '0',
    notes: '',
  });
  const [form, setForm] = useState({
    customer: '',
    store_ref: '',
    job_no: '',
    ic_number: '',
    product: '',
    quantity: '1',
    cash_amount: '0',
    online_amount: '0',
    exchange_amount: '0',
    exchange_model: '',
    got_amount: '0',
    gift: '',
    salesperson_name: '',
    notes: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [salesData, customerData, productData, storeData] = await Promise.all([
          listSales(),
          listCustomers(),
          listProducts(),
          listStores(),
        ]);
        setSales(salesData);
        setCustomers(customerData);
        setProducts(productData.filter((product) => product.active));
        setStores(storeData.filter((store) => store.is_active));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sales');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const customerById = useMemo(() => {
    const map = new Map<string, ApiCustomer>();
    customers.forEach((customer) => map.set(customer.id, customer));
    return map;
  }, [customers]);

  const productById = useMemo(() => {
    const map = new Map<string, ApiProduct>();
    products.forEach((product) => map.set(product.id, product));
    return map;
  }, [products]);

  const storeById = useMemo(() => {
    const map = new Map<string, ApiStore>();
    stores.forEach((store) => map.set(store.id, store));
    return map;
  }, [stores]);

  const storeOptions = useMemo(() => ['All Stores', ...stores.map((store) => store.name)], [stores]);

  const filteredSales = useMemo(() => {
    let list = sales;
    if (storeFilter !== 'All Stores') {
      list = list.filter((sale) => storeById.get(sale.store_ref || '')?.name === storeFilter);
    }
    if (query) {
      list = list.filter((sale) => {
        const customerName = sale.customer ? (customerById.get(sale.customer)?.name || `Customer ${sale.customer}`) : 'Walk-in';
        const productNames = sale.items.map((item) => productById.get(item.product)?.name || `Product ${item.product}`).join(' ');
        return customerName.toLowerCase().includes(query)
          || productNames.toLowerCase().includes(query)
          || (sale.notes || '').toLowerCase().includes(query)
          || `sale${sale.id}`.includes(query);
      });
    }
    return list;
  }, [sales, storeFilter, query, storeById, customerById, productById]);

  const handleStoreChange = (store: string) => {
    const params = new URLSearchParams(searchParams);
    if (store === 'All Stores') params.delete('store');
    else params.set('store', store);
    setSearchParams(params, { replace: true });
  };

  const handleCreateSale = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setStatusMessage('');
    setPendingDeleteSaleId(null);

    const productId = form.product;
    const quantity = Number(form.quantity);
    const selectedProduct = productById.get(productId);

    if (!form.store_ref) {
      setFormError('Store is required.');
      return;
    }
    if (!selectedProduct) {
      setFormError('Select a valid product.');
      return;
    }
    if (!quantity || quantity < 1) {
      setFormError('Quantity must be at least 1.');
      return;
    }

    try {
      setSaving(true);
      const created = await createSale({
        customer: form.customer ? form.customer : null,
        store_ref: form.store_ref,
        job_no: form.job_no.trim(),
        ic_number: form.ic_number.trim(),
        cash_amount: Number(form.cash_amount || 0).toFixed(2),
        online_amount: Number(form.online_amount || 0).toFixed(2),
        exchange_amount: Number(form.exchange_amount || 0).toFixed(2),
        exchange_model: form.exchange_model.trim(),
        got_amount: Number(form.got_amount || 0).toFixed(2),
        gift: form.gift.trim(),
        salesperson_name: form.salesperson_name.trim(),
        notes: form.notes.trim(),
        items: [{
          product: selectedProduct.id,
          quantity,
          unit_price: Number(selectedProduct.price).toFixed(2),
        }],
      });
      setSales((prev) => [created, ...prev]);
      setForm({
        customer: '',
        store_ref: '',
        job_no: '',
        ic_number: '',
        product: '',
        quantity: '1',
        cash_amount: '0',
        online_amount: '0',
        exchange_amount: '0',
        exchange_model: '',
        got_amount: '0',
        gift: '',
        salesperson_name: '',
        notes: '',
      });
      setStatusMessage(`Sale #${created.id} created successfully with server totals.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create sale');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEditSale = (sale: ApiSale) => {
    setStatusMessage('');
    setError('');
    setEditingSaleId(sale.id);
    setEditForm({
      customer: sale.customer ? String(sale.customer) : '',
      cash_amount: sale.cash_amount || '0',
      online_amount: sale.online_amount || '0',
      notes: sale.notes || '',
    });
  };

  const handleEditSale = async (sale: ApiSale) => {
    setStatusMessage('');

    try {
      const updated = await updateSale(sale.id, {
        customer: editForm.customer.trim() ? editForm.customer : null,
        cash_amount: Number(editForm.cash_amount || sale.cash_amount || 0).toFixed(2),
        online_amount: Number(editForm.online_amount || sale.online_amount || 0).toFixed(2),
        notes: editForm.notes,
      });
      setSales((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setEditingSaleId(null);
      setStatusMessage(`Sale #${updated.id} updated successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sale');
    }
  };

  const handleDeleteSale = async (sale: ApiSale) => {
    setStatusMessage('');
    try {
      await deleteSale(sale.id);
      setSales((prev) => prev.filter((entry) => entry.id !== sale.id));
      setPendingDeleteSaleId(null);
      setStatusMessage(`Sale #${sale.id} deleted successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sale');
    }
  };

  if (isPrivilegedUser(user)) {
    return (
      <div className="card sales-empty-state" style={{ padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>Sales</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>
          Admin access is report-focused. Use the Reports section to review and download sales summaries.
        </p>
      </div>
    );
  }

  return (
    <div className="sales-page">
      <div className="card sales-top" style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>Sales</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>Store-aware sales entry and management</p>
        </div>
        <select value={storeFilter} onChange={(e) => handleStoreChange(e.target.value)} className="form-input" style={{ maxWidth: 220 }}>
          {storeOptions.map((store) => <option key={store} value={store}>{store}</option>)}
        </select>
      </div>

      <form onSubmit={handleCreateSale} className="card sales-form" style={{ padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontWeight: 800 }}>Add Sale</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div style={fieldStyle}><label style={labelStyle}>Store</label><select className="form-input" value={form.store_ref} onChange={(e) => setForm((prev) => ({ ...prev, store_ref: e.target.value }))}>
            <option value="">Select Store *</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select></div>
          <div style={fieldStyle}><label style={labelStyle}>Customer</label><select className="form-input" value={form.customer} onChange={(e) => setForm((prev) => ({ ...prev, customer: e.target.value }))}>
            <option value="">Walk-in Customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select></div>
          <div style={fieldStyle}><label style={labelStyle}>Job Number</label><input className="form-input" value={form.job_no} onChange={(e) => setForm((prev) => ({ ...prev, job_no: e.target.value }))} placeholder="Job No" /></div>
          <div style={fieldStyle}><label style={labelStyle}>IC Number</label><input className="form-input" value={form.ic_number} onChange={(e) => setForm((prev) => ({ ...prev, ic_number: e.target.value }))} placeholder="IC" /></div>
          <div style={fieldStyle}><label style={labelStyle}>Product</label><select className="form-input" value={form.product} onChange={(e) => setForm((prev) => ({ ...prev, product: e.target.value }))}>
            <option value="">Select Product *</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select></div>
          <div style={fieldStyle}><label style={labelStyle}>Quantity</label><input className="form-input" type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))} placeholder="Qty" /></div>
          <div style={fieldStyle}><label style={labelStyle}>Cash Amount</label><input className="form-input" type="number" min="0" step="0.01" value={form.cash_amount} onChange={(e) => setForm((prev) => ({ ...prev, cash_amount: e.target.value }))} placeholder="Cash" /></div>
          <div style={fieldStyle}><label style={labelStyle}>Online Amount</label><input className="form-input" type="number" min="0" step="0.01" value={form.online_amount} onChange={(e) => setForm((prev) => ({ ...prev, online_amount: e.target.value }))} placeholder="Online" /></div>
          <div style={fieldStyle}><label style={labelStyle}>Exchange Amount</label><input className="form-input" type="number" min="0" step="0.01" value={form.exchange_amount} onChange={(e) => setForm((prev) => ({ ...prev, exchange_amount: e.target.value }))} placeholder="Ex Amount" /></div>
          <div style={fieldStyle}><label style={labelStyle}>Exchange Model</label><input className="form-input" value={form.exchange_model} onChange={(e) => setForm((prev) => ({ ...prev, exchange_model: e.target.value }))} placeholder="Ex Model" /></div>
          <div style={fieldStyle}><label style={labelStyle}>Got Amount</label><input className="form-input" type="number" min="0" step="0.01" value={form.got_amount} onChange={(e) => setForm((prev) => ({ ...prev, got_amount: e.target.value }))} placeholder="Got" /></div>
          <div style={fieldStyle}><label style={labelStyle}>Gift</label><input className="form-input" value={form.gift} onChange={(e) => setForm((prev) => ({ ...prev, gift: e.target.value }))} placeholder="Gift" /></div>
          <div style={fieldStyle}><label style={labelStyle}>Salesman Name</label><input className="form-input" value={form.salesperson_name} onChange={(e) => setForm((prev) => ({ ...prev, salesperson_name: e.target.value }))} placeholder="Salesman" /></div>
          <div style={fieldStyle}><label style={labelStyle}>Notes</label><input className="form-input" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes" /></div>
        </div>
        {formError && <p style={{ margin: '10px 0 0', color: 'var(--color-error-600)' }}>{formError}</p>}
        <button className="btn btn-primary" type="submit" style={{ marginTop: 12 }} disabled={saving}>
          {saving ? 'Saving...' : '+ Add Sale'}
        </button>
      </form>

      {editingSaleId !== null && (
        <div className="card sales-form" style={{ padding: 16 }}>
          <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontWeight: 800 }}>Edit Sale</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div style={fieldStyle}>
              <label style={labelStyle}>Customer ID</label>
              <input className="form-input" value={editForm.customer} onChange={(e) => setEditForm((prev) => ({ ...prev, customer: e.target.value }))} placeholder="Blank for walk-in" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Cash Amount</label>
              <input className="form-input" type="number" min="0" step="0.01" value={editForm.cash_amount} onChange={(e) => setEditForm((prev) => ({ ...prev, cash_amount: e.target.value }))} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Online Amount</label>
              <input className="form-input" type="number" min="0" step="0.01" value={editForm.online_amount} onChange={(e) => setEditForm((prev) => ({ ...prev, online_amount: e.target.value }))} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Notes</label>
              <input className="form-input" value={editForm.notes} onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                const sale = sales.find((entry) => entry.id === editingSaleId);
                if (sale) {
                  void handleEditSale(sale);
                }
              }}
            >
              Save Changes
            </button>
            <button className="btn btn-secondary" onClick={() => setEditingSaleId(null)}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <p className="sales-state">Loading sales...</p>}
      {error && <p className="sales-state sales-state-error">{error}</p>}
      {!error && statusMessage && <p className="sales-state">{statusMessage}</p>}

      <div className="card sales-table-wrap" style={{ overflow: 'hidden' }}>
        <table className="sales-table-modern" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '14px 16px', textAlign: 'left' }}>Sale #</th>
              <th style={{ padding: '14px 16px', textAlign: 'left' }}>Customer</th>
              <th style={{ padding: '14px 16px', textAlign: 'left' }}>Store</th>
              <th style={{ padding: '14px 16px', textAlign: 'center' }}>Items</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '14px 16px', textAlign: 'left' }}>Sold At</th>
              <th style={{ padding: '14px 16px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.map((sale) => {
              const customerName = sale.customer ? (customerById.get(sale.customer)?.name || `Customer ${sale.customer}`) : 'Walk-in';
              const storeName = storeById.get(sale.store_ref || '')?.name || '-';
              return (
                <tr key={sale.id}>
                  <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--primary)' }} className="sales-row-id">SALE{String(sale.id).padStart(5, '0')}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>{customerName}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>{storeName}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-primary)' }}>{sale.items.length}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)' }} className="sales-row-amount">Rs {Number(sale.total_amount).toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(sale.sold_at).toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button className="btn" style={{ padding: '6px 10px' }} onClick={() => handleStartEditSale(sale)}>Edit</button>
                      {pendingDeleteSaleId === sale.id ? (
                        <>
                          <button className="btn" style={{ padding: '6px 10px', background: 'var(--color-error-100)', color: 'var(--color-error-700)' }} onClick={() => void handleDeleteSale(sale)}>Confirm</button>
                          <button className="btn" style={{ padding: '6px 10px' }} onClick={() => setPendingDeleteSaleId(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn" style={{ padding: '6px 10px', background: 'var(--color-error-100)', color: 'var(--color-error-700)' }} onClick={() => setPendingDeleteSaleId(sale.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && filteredSales.length === 0 && <tr><td colSpan={7} className="sales-empty">No sales found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Sales;

