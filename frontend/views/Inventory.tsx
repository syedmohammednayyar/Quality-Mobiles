import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from '../types';
import {
  createProduct,
  deleteProduct,
  listStoreInventory,
  listProductTransferHistory,
  transferInventoryStock,
  updateProduct,
  type ApiStore,
  type ApiStoreInventoryRow,
  type ApiProductTransferHistory,
  type CreateProductPayload,
} from '../services/api';
import './Inventory.css';

interface InventoryProps {
  user: User;
  stores?: ApiStore[];
}

type SortKey = 'name' | 'price' | 'value' | 'updated';
type SortDir = 'asc' | 'desc';

type ProductForm = Omit<CreateProductPayload, 'stock_quantity'>;

const brands = ['Apple', 'Samsung', 'Vivo', 'Oppo', 'Redmi', 'Realme', 'OnePlus', 'Motorola', 'Nothing', 'Tecno', 'Infinix'];

const modelMap: Record<string, string[]> = {
  Apple: ['iPhone 15', 'iPhone 15 Pro', 'iPhone 14', 'iPhone 13', 'iPhone 12'],
  Samsung: ['A15', 'A25', 'A35', 'A55', 'S23', 'S24 Ultra'],
  Vivo: ['Y17s', 'Y28', 'V30', 'V40', 'T3'],
  Oppo: ['A38', 'A59', 'Reno 11', 'Reno 12', 'F25 Pro'],
  Redmi: ['A3', '12 5G', '13C', 'Note 13', 'Note 13 Pro'],
  Realme: ['C53', 'C55', 'Narzo 70', '12 Pro', 'GT 6T'],
  OnePlus: ['Nord CE 4', 'Nord 4', '12R', '12', 'Open'],
};

function toMoney(value: number | string | undefined): string {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function buildBlankForm(storeId: string, remembered?: Partial<ProductForm>): ProductForm {
  return {
    job_id: '',
    product_code: '',
    sku: '',
    barcode: '',
    imei: '',
    serial_number: '',
    name: '',
    brand: remembered?.brand || '',
    model: '',
    network_type: '5G',
    category: remembered?.category || 'new_phone',
    variant: '',
    ram: '',
    storage: '',
    color: '',
    condition: 'new',
    purchase_price: '',
    price: '',
    discount: '',
    tax: '',
    inventory_status: 'ready',
    inventory_mode: 'bulk',
    primary_store_ref: storeId || null,
    supplier_name: remembered?.supplier_name || '',
    supplier_contact: '',
    purchase_date: '',
    remarks: '',
    device_notes: '',
    active: true,
  };
}

function productName(form: ProductForm) {
  return [form.brand, form.model, form.ram, form.storage, form.network_type].filter(Boolean).join(' ').trim();
}

function makeSku(form: ProductForm) {
  const base = [form.brand, form.model, form.ram, form.storage, form.network_type]
    .filter(Boolean)
    .join('-')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();
  return `${base || 'QM'}-${Date.now().toString(36).toUpperCase()}`;
}

const Inventory: React.FC<InventoryProps> = ({ user, stores = [] }) => {
  const activeStores = useMemo(() => stores.filter((store) => store.is_active), [stores]);
  const managerStoreId = user.role === 'Manager' ? user.assignedStoreId : undefined;
  const visibleStores = useMemo(
    () => managerStoreId ? activeStores.filter((store) => store.id === managerStoreId) : activeStores,
    [activeStores, managerStoreId],
  );

  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [rows, setRows] = useState<ApiStoreInventoryRow[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [form, setForm] = useState<ProductForm>(() => buildBlankForm(''));
  const [transferRow, setTransferRow] = useState<ApiStoreInventoryRow | null>(null);
  const [transferStoreId, setTransferStoreId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [detailRow, setDetailRow] = useState<ApiStoreInventoryRow | null>(null);
  const [transferHistory, setTransferHistory] = useState<ApiProductTransferHistory[]>([]);
  const modelRef = useRef<HTMLInputElement>(null);

  const isAdmin = user.role === 'Admin';
  const isManager = user.role === 'Manager';
  const pageSize = 25;

  useEffect(() => {
    if (visibleStores.length > 0 && !selectedStoreId) setSelectedStoreId(visibleStores[0].id);
    if (visibleStores.length === 0) {
      setRows([]);
      setLoading(false);
    }
  }, [visibleStores, selectedStoreId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 220);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const refreshInventory = () => setInventoryRefreshKey((value) => value + 1);
    window.addEventListener('inventory:changed', refreshInventory);
    const interval = window.setInterval(refreshInventory, 5000);
    return () => {
      window.removeEventListener('inventory:changed', refreshInventory);
      window.clearInterval(interval);
    };
  }, []);

  const loadInventory = async (storeId: string, searchOverride = debouncedSearch) => {
    try {
      setLoading(true);
      setError('');
      const data = await listStoreInventory(storeId, { search: searchOverride, limit: 500, offset: 0 });
      setRows(data);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStoreId) {
      setForm((prev) => ({ ...prev, primary_store_ref: selectedStoreId }));
      void loadInventory(selectedStoreId);
    }
  }, [selectedStoreId, debouncedSearch, inventoryRefreshKey]);

  const rememberedDefaults = useMemo(() => ({
    brand: form.brand,
    category: form.category,
    supplier_name: form.supplier_name,
  }), [form.brand, form.category, form.supplier_name]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => (
      (statusFilter === 'all' || row.inventory_status === statusFilter)
      && (brandFilter === 'all' || row.brand === brandFilter)
    )).sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'price') return (Number(a.final_price || a.unit_price) - Number(b.final_price || b.unit_price)) * dir;
      if (sortKey === 'value') return (Number(a.final_price || a.unit_price) - Number(b.final_price || b.unit_price)) * dir;
      if (sortKey === 'updated') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir;
      return a.name.localeCompare(b.name) * dir;
    });
  }, [rows, sortDir, sortKey, statusFilter, brandFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [debouncedSearch, selectedStoreId, sortKey, sortDir]);

  const summary = useMemo(() => {
    const totalProducts = filteredRows.length;
    const totalValue = filteredRows.filter((row) => row.quantity > 0).reduce((sum, row) => sum + Number(row.final_price || row.unit_price), 0);
    const availableStock = filteredRows.filter((row) => row.quantity > 0).length;
    const stock4g = filteredRows.filter((row) => row.network_type === '4G').length;
    const stock5g = filteredRows.filter((row) => row.network_type === '5G').length;
    const soldRecords = filteredRows.filter((row) => row.quantity <= 0).length;
    return { totalProducts, totalValue, availableStock, stock4g, stock5g, soldRecords };
  }, [filteredRows]);

  const updateForm = (patch: Partial<ProductForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const resetForNext = () => {
    setForm(buildBlankForm(selectedStoreId, rememberedDefaults));
    window.setTimeout(() => modelRef.current?.focus(), 0);
  };

  const buildPayload = (source: ProductForm): CreateProductPayload => ({
    ...source,
    sku: source.sku || makeSku(source),
    name: source.name || productName(source),
    price: source.price || source.purchase_price || '0',
    stock_quantity: 1,
    min_stock_level: 0,
    primary_store_ref: selectedStoreId,
    inventory_mode: 'bulk',
  });

  const saveProduct = async (addNext: boolean) => {
    setSaving(true);
    setError('');
    setStatusMessage('');
    try {
      if (!form.job_id?.trim()) throw new Error('Job Number is required.');
      if (rows.some((row) => row.job_id.toLowerCase() === form.job_id?.trim().toLowerCase())) throw new Error('Job Number already exists.');
      await createProduct(buildPayload(form));
      setStatusMessage('Product added.');
      setSearch('');
      setDebouncedSearch('');
      setPage(1);
      await loadInventory(selectedStoreId, '');
      if (addNext) resetForNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const inlineSave = async (row: ApiStoreInventoryRow, field: 'price', value: string) => {
    if (!isAdmin) return;
    const payload: Partial<CreateProductPayload> = {
      primary_store_ref: selectedStoreId,
      sku: row.sku,
      name: row.name,
    };
    if (field === 'price') {
      payload.purchase_price = value;
    }

    try {
      await updateProduct(row.product_id, payload);
      setStatusMessage('Saved inline change.');
      await loadInventory(selectedStoreId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save inline change');
    }
  };

  const openTransfer = (row: ApiStoreInventoryRow) => {
    setTransferRow(row);
    setTransferStoreId('');
  };

  const openDetails = async (row: ApiStoreInventoryRow) => {
    setDetailRow(row);
    setTransferHistory([]);
    try {
      setTransferHistory(await listProductTransferHistory(row.product_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transfer history');
    }
  };

  const submitTransfer = async () => {
    if (!transferRow || !transferStoreId) return;
    setSaving(true);
    setError('');
    setStatusMessage('');
    try {
      await transferInventoryStock({
        from_store_id: transferRow.store_id,
        to_store_id: transferStoreId,
        product_id: transferRow.product_id,
        quantity: 1,
        reason: `Transfer ${transferRow.job_id || transferRow.product_code || transferRow.sku}`,
      });
      setStatusMessage('Product transferred. POS visibility updated.');
      setTransferRow(null);
      setTransferStoreId('');
      window.dispatchEvent(new CustomEvent('inventory:changed', {
        detail: { storeIds: [transferRow.store_id, transferStoreId], productId: transferRow.product_id },
      }));
      await loadInventory(selectedStoreId, '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transfer product');
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = async (row: ApiStoreInventoryRow) => {
    if (!window.confirm(`Delete ${row.name} from inventory?`)) return;
    try {
      await deleteProduct(row.product_id);
      setStatusMessage('Product removed from active inventory.');
      await loadInventory(selectedStoreId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product');
    }
  };

  const modelOptions = [...new Set([...(modelMap[form.brand] || []), ...rows.filter((row) => row.brand === form.brand).map((row) => row.model).filter(Boolean)])];

  return (
    <div className="inventory-page">
      <section className="inventory-entry-shell">
        <div className="inventory-entry-head">
          <div>
            <h1>Inventory</h1>
            <p>Fast stock entry for daily mobile shop work.</p>
          </div>
          <label className="inventory-store-picker">
            <span>Store</span>
            <select value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)} disabled={isManager}>
              {visibleStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
        </div>

        <form className="inventory-fast-form" onSubmit={(event) => { event.preventDefault(); void saveProduct(true); }}>
          <label>
            <span>Job Number</span>
            <input value={form.job_id || ''} onChange={(event) => updateForm({ job_id: event.target.value.toUpperCase() })} placeholder="JOB-00001" required />
          </label>
          <label>
            <span>Brand</span>
            <input list="inventory-brands" value={form.brand} onChange={(event) => updateForm({ brand: event.target.value, model: '' })} required />
            <datalist id="inventory-brands">{brands.map((brand) => <option key={brand} value={brand} />)}</datalist>
          </label>
          <label>
            <span>Model</span>
            <input ref={modelRef} list="inventory-models" value={form.model} onChange={(event) => updateForm({ model: event.target.value })} placeholder="Select or add new model" required />
            <datalist id="inventory-models">{modelOptions.map((model) => <option key={model} value={model} />)}</datalist>
          </label>
          <label>
            <span>Purchase Price</span>
            <input type="number" min="0" value={form.purchase_price || ''} onChange={(event) => updateForm({ purchase_price: event.target.value, price: form.price || event.target.value })} required />
          </label>
          <label>
            <span>Selling Price</span>
            <input type="number" min="0" value={form.price || ''} onChange={(event) => updateForm({ price: event.target.value })} required />
          </label>
          <label>
            <span>IMEI</span>
            <input value={form.imei || ''} onChange={(event) => updateForm({ imei: event.target.value })} placeholder="Unique IMEI" />
          </label>
          <label>
            <span>Storage</span>
            <select value={form.storage || ''} onChange={(event) => updateForm({ storage: event.target.value })}>
              <option value="">Select</option><option>64GB</option><option>128GB</option><option>256GB</option><option>512GB</option><option>1TB</option>
            </select>
          </label>
          <label>
            <span>RAM</span>
            <select value={form.ram || ''} onChange={(event) => updateForm({ ram: event.target.value })}>
              <option value="">Select</option><option>4GB</option><option>6GB</option><option>8GB</option><option>12GB</option><option>16GB</option>
            </select>
          </label>
          <label>
            <span>Network</span>
            <select value={form.network_type || '5G'} onChange={(event) => updateForm({ network_type: event.target.value as ProductForm['network_type'] })}>
              <option value="5G">5G</option>
              <option value="4G">4G</option>
            </select>
          </label>
          <label>
            <span>Category</span>
            <select value={form.category} onChange={(event) => updateForm({ category: event.target.value as ProductForm['category'] })}>
              <option value="new_phone">New Phone</option>
              <option value="used_phone">Used Phone</option>
              <option value="accessories">Accessories</option>
              <option value="services">Service</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={form.inventory_status || 'ready'} onChange={(event) => updateForm({ inventory_status: event.target.value as ProductForm['inventory_status'] })}>
              <option value="ready">Ready</option>
            </select>
          </label>
          <div className="inventory-form-actions">
            <button type="button" className="btn btn-secondary" onClick={resetForNext}>Clear</button>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void saveProduct(false)}>{saving ? 'Saving...' : 'Save'}</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save & Add Next'}</button>
          </div>
        </form>
      </section>

      {error && <p className="inventory-state inventory-state-error">{error}</p>}
      {!error && statusMessage && <p className="inventory-state inventory-state-success">{statusMessage}</p>}

      <section className="inventory-dashboard">
        <div><span>Total Products</span><strong>{summary.totalProducts}</strong></div>
        <div><span>Total Stock Value</span><strong>Rs {toMoney(summary.totalValue)}</strong></div>
        <div><span>Available in POS</span><strong>{summary.availableStock}</strong></div>
        <div><span>4G Records</span><strong>{summary.stock4g}</strong></div>
        <div><span>5G Records</span><strong>{summary.stock5g}</strong></div>
        <div><span>History Records</span><strong>{summary.soldRecords}</strong></div>
      </section>

      <section className="inventory-table-panel">
        <div className="inventory-table-tools">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job, product code, SKU, IMEI, brand, model..." />
          <div className="inventory-sort-controls">
            <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
              <option value="all">All Brands</option>
              {[...new Set(rows.map((row) => row.brand).filter(Boolean))].sort().map((brand) => <option key={brand} value={brand}>{brand}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Statuses</option><option value="ready">Ready</option><option value="sold">Sold</option>
            </select>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              <option value="updated">Recently Updated</option>
              <option value="name">Product Name</option>
              <option value="price">Price</option>
              <option value="value">Stock Value</option>
            </select>
            <button onClick={() => setSortDir((dir) => dir === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? 'Asc' : 'Desc'}</button>
          </div>
        </div>

        <div className="inventory-table-scroll">
          <table className="inventory-table-modern">
            <thead>
              <tr>
                <th>Job Number</th>
                <th>Brand</th>
                <th>Model</th>
                <th>IMEI</th>
                <th>Store</th>
                <th>Purchase Price</th>
                <th>Selling Price</th>
                <th>Product Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={`${row.store_id}-${row.product_id}`}>
                  <td><strong>{row.job_id || '-'}</strong></td>
                  <td><strong>{row.brand || '-'}</strong></td>
                  <td><strong>{row.model || '-'}</strong></td>
                  <td><strong>{row.imei || '-'}</strong></td>
                  <td><strong>{row.store_name || visibleStores.find((store) => store.id === row.store_id)?.name || '-'}</strong></td>
                  <td><input className="inline-input money" defaultValue={row.purchase_price || row.final_price || row.unit_price} onBlur={(event) => void inlineSave(row, 'price', event.target.value)} disabled={!isAdmin} /></td>
                  <td><strong>Rs {toMoney(Number(row.selling_price || row.unit_price))}</strong></td>
                  <td><span className={row.category === 'used_phone' ? 'inventory-type used' : 'inventory-type new'}>{row.category === 'used_phone' ? 'USED PHONE' : 'NEW'}</span></td>
                  <td><span className={`inventory-status ${row.inventory_status || 'ready'}`}>{row.inventory_status || 'ready'}</span></td>
                  <td>
                    <div className="inventory-row-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => void openDetails(row)}>Details</button>
                      {(isAdmin || isManager) && row.quantity > 0 && row.inventory_status !== 'sold' && row.active !== false && <button className="btn btn-sm btn-secondary" onClick={() => openTransfer(row)}>Transfer</button>}
                      {isAdmin && <button className="btn btn-sm btn-danger" onClick={() => void removeProduct(row)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && pagedRows.length === 0 && <tr><td colSpan={10} className="inventory-empty">No inventory found.</td></tr>}
              {loading && <tr><td colSpan={10} className="inventory-empty">Loading inventory...</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="inventory-pagination">
          <span>Showing {pagedRows.length} of {filteredRows.length} job records</span>
          <div>
            <button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Prev</button>
            <span>Page {page} / {pageCount}</span>
            <button className="btn btn-sm btn-secondary" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button>
          </div>
        </div>
      </section>
      {transferRow && (
        <div className="inventory-transfer-panel">
          <strong>Transfer {transferRow.job_id || transferRow.product_code || transferRow.name}</strong>
          <select className="form-input" value={transferStoreId} onChange={(event) => setTransferStoreId(event.target.value)}>
            <option value="">Destination store</option>
            {activeStores.filter((store) => store.id !== transferRow.store_id).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" disabled={!transferStoreId || saving} onClick={() => void submitTransfer()}>{saving ? 'Transferring...' : 'Confirm Transfer'}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setTransferRow(null)}>Cancel</button>
        </div>
      )}
      {detailRow && (
        <div className="inventory-detail-backdrop">
          <div className="inventory-detail-modal">
            <div className="inventory-modal-head"><div><h2>{detailRow.job_id}</h2><p>{detailRow.brand} {detailRow.model}</p></div><button onClick={() => setDetailRow(null)}>x</button></div>
            <div className="inventory-detail-grid"><div><span>IMEI</span><strong>{detailRow.imei || '-'}</strong></div><div><span>Store</span><strong>{detailRow.store_name}</strong></div><div><span>Product Type</span><strong>{detailRow.category === 'used_phone' ? 'Used Phone (Buyback)' : 'New Phone'}</strong></div><div><span>Selling Price</span><strong>Rs {toMoney(detailRow.selling_price || detailRow.unit_price)}</strong></div></div>
            <h3>Transfer History</h3>
            <div className="inventory-history">{transferHistory.map((entry) => <div key={entry.id}><strong>{entry.from_store_name} to {entry.to_store_name}</strong><span>{new Date(entry.transferred_at).toLocaleString()} | {entry.transferred_by || 'System'} | {entry.remarks}</span></div>)}{transferHistory.length === 0 && <p>No transfer history.</p>}</div>
            <div className="inventory-modal-actions"><button className="btn btn-secondary" onClick={() => setDetailRow(null)}>Close</button>{(isAdmin || isManager) && detailRow.quantity > 0 && detailRow.inventory_status !== 'sold' && <button className="btn btn-primary" onClick={() => { setDetailRow(null); openTransfer(detailRow); }}>Transfer</button>}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
