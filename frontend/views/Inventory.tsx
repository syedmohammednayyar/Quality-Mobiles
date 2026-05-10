import React, { useEffect, useMemo, useState } from 'react';
import { User } from '../types';
import {
  createInventoryChangeRequest,
  createProduct,
  deleteProduct,
  listStoreInventory,
  transferInventoryStock,
  updateProduct,
  type ApiStore,
  type ApiStoreInventoryRow,
  type CreateProductPayload,
} from '../services/api';
import './Inventory.css';

interface InventoryProps {
  user: User;
  stores?: ApiStore[];
}

type ProductForm = Omit<CreateProductPayload, 'stock_quantity'> & {
  stock_quantity: string;
  min_stock_level: string;
};

const emptyProductForm: ProductForm = {
  job_id: '',
  product_code: '',
  sku: '',
  barcode: '',
  imei: '',
  serial_number: '',
  name: '',
  brand: '',
  model: '',
  category: 'new_phone',
  variant: '',
  ram: '',
  storage: '',
  color: '',
  condition: 'new',
  purchase_price: '',
  price: '',
  discount: '',
  tax: '',
  stock_quantity: '1',
  min_stock_level: '1',
  primary_store_ref: null,
  supplier_name: '',
  supplier_contact: '',
  purchase_date: '',
  remarks: '',
  device_notes: '',
  active: true,
};

const categoryLabels: Record<string, string> = {
  new_phone: 'New Phone',
  used_phone: 'Used Phone',
  accessory: 'Accessory',
  accessories: 'Accessory',
  service: 'Service',
  services: 'Service',
  repair_part: 'Repair Part',
};

const statusLabels: Record<string, string> = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out',
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: 'var(--text-secondary)',
};

function toMoney(value: number | string | undefined): string {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
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
  const [category, setCategory] = useState('all');
  const [stockStatus, setStockStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [editingRow, setEditingRow] = useState<ApiStoreInventoryRow | null>(null);
  const [transferRow, setTransferRow] = useState<ApiStoreInventoryRow | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [transferForm, setTransferForm] = useState({ to_store_id: '', quantity: '1', reason: '' });

  const isAdmin = user.role === 'Admin';
  const isManager = user.role === 'Manager';
  const pageSize = 12;

  useEffect(() => {
    if (visibleStores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(visibleStores[0].id);
      return;
    }
    if (visibleStores.length === 0) {
      setRows([]);
      setLoading(false);
    }
  }, [visibleStores, selectedStoreId]);

  const loadInventory = async (storeId: string) => {
    try {
      setLoading(true);
      setError('');
      const data = await listStoreInventory(storeId);
      setRows(data);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStoreId) void loadInventory(selectedStoreId);
  }, [selectedStoreId]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !q || [
        row.job_id,
        row.product_code,
        row.sku,
        row.barcode,
        row.imei,
        row.serial_number,
        row.name,
        row.brand,
        row.model,
      ].some((value) => String(value || '').toLowerCase().includes(q));
      const matchesCategory = category === 'all' || row.category === category;
      const matchesStatus = stockStatus === 'all' || row.stock_status === stockStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [rows, search, category, stockStatus]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, category, stockStatus, selectedStoreId]);

  const totalUnits = filteredRows.reduce((sum, row) => sum + row.quantity, 0);
  const lowStock = filteredRows.filter((row) => row.stock_status === 'low_stock' || row.quantity <= row.min_stock_level).length;
  const outOfStock = filteredRows.filter((row) => row.quantity <= 0).length;
  const inventoryValue = filteredRows.reduce((sum, row) => sum + (Number(row.final_price || row.unit_price) * row.quantity), 0);

  const openNewProduct = () => {
    setEditingRow(null);
    setProductForm({ ...emptyProductForm, primary_store_ref: selectedStoreId });
    setShowProductModal(true);
  };

  const openEditProduct = (row: ApiStoreInventoryRow) => {
    setEditingRow(row);
    setProductForm({
      job_id: row.job_id || '',
      product_code: row.product_code || '',
      sku: row.sku,
      barcode: row.barcode || '',
      imei: row.imei || '',
      serial_number: row.serial_number || '',
      name: row.name,
      brand: row.brand || '',
      model: row.model || '',
      category: row.category === 'accessory' ? 'accessories' : (row.category === 'service' ? 'services' : row.category as ProductForm['category']),
      variant: row.variant || '',
      ram: row.ram || '',
      storage: row.storage || '',
      color: row.color || '',
      condition: (row.condition as ProductForm['condition']) || 'new',
      purchase_price: row.purchase_price || '',
      price: row.unit_price,
      discount: row.discount || '',
      tax: row.tax || '',
      stock_quantity: String(row.quantity),
      min_stock_level: String(row.min_stock_level),
      primary_store_ref: row.store_id,
      supplier_name: row.supplier_name || '',
      supplier_contact: row.supplier_contact || '',
      purchase_date: row.purchase_date || '',
      remarks: row.remarks || '',
      device_notes: row.device_notes || '',
      active: true,
    });
    setShowProductModal(true);
  };

  const submitProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setStatusMessage('');

    const payload: CreateProductPayload = {
      ...productForm,
      stock_quantity: Number(productForm.stock_quantity || 0),
      min_stock_level: Number(productForm.min_stock_level || 0),
      primary_store_ref: selectedStoreId,
      price: productForm.price || '0',
    };

    try {
      if (editingRow) {
        await updateProduct(editingRow.product_id, payload);
        setStatusMessage('Inventory item updated.');
      } else {
        await createProduct(payload);
        setStatusMessage('Product added to store inventory.');
      }
      setShowProductModal(false);
      await loadInventory(selectedStoreId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const requestManagerChange = async (row: ApiStoreInventoryRow) => {
    const input = window.prompt(`Enter new quantity for ${row.name}`, String(row.quantity));
    if (!input) return;
    const nextQuantity = Number(input);
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
      setError('Quantity must be a non-negative number.');
      return;
    }
    const reason = window.prompt('Reason for this inventory change') || '';
    try {
      await createInventoryChangeRequest(row.store_id, row.product_id, row.quantity, nextQuantity, reason);
      setStatusMessage('Inventory change request submitted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit change request');
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

  const openTransfer = (row: ApiStoreInventoryRow) => {
    setTransferRow(row);
    setTransferForm({ to_store_id: '', quantity: '1', reason: '' });
    setShowTransferModal(true);
  };

  const submitTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!transferRow) return;
    setSaving(true);
    setError('');
    try {
      await transferInventoryStock({
        from_store_id: selectedStoreId,
        to_store_id: transferForm.to_store_id,
        product_id: transferRow.product_id,
        quantity: Number(transferForm.quantity || 0),
        reason: transferForm.reason,
      });
      setShowTransferModal(false);
      setStatusMessage('Stock transferred successfully.');
      await loadInventory(selectedStoreId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transfer stock');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="inventory-page">
      <div className="card inventory-top">
        <div>
          <h1>Inventory Management</h1>
          <p>Store-isolated stock, serialized devices, accessories, transfers, and POS-ready products.</p>
        </div>
        <div className="inventory-top-actions">
          {isAdmin && <button className="btn btn-secondary" onClick={() => setShowTransferModal(true)}>Transfer</button>}
          {isAdmin && <button className="btn btn-primary" onClick={openNewProduct}>New Product</button>}
        </div>
      </div>

      <div className="inventory-toolbar card">
        <label>
          <span>Store</span>
          <select className="form-input" value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)} disabled={isManager}>
            {visibleStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
        <label>
          <span>Search</span>
          <input className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Job ID, IMEI, barcode, SKU, product" />
        </label>
        <label>
          <span>Category</span>
          <select className="form-input" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All Categories</option>
            <option value="new_phone">New Phones</option>
            <option value="used_phone">Used Phones</option>
            <option value="accessory">Accessories</option>
            <option value="service">Services</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select className="form-input" value={stockStatus} onChange={(event) => setStockStatus(event.target.value)}>
            <option value="all">All Stock</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
        </label>
      </div>

      {error && <p className="inventory-state inventory-state-error">{error}</p>}
      {!error && statusMessage && <p className="inventory-state inventory-state-success">{statusMessage}</p>}

      <div className="inventory-stats">
        <div className="card inventory-stat-card"><span>SKUs</span><strong>{filteredRows.length}</strong></div>
        <div className="card inventory-stat-card"><span>Total Units</span><strong>{totalUnits.toLocaleString()}</strong></div>
        <div className="card inventory-stat-card"><span>Low Stock</span><strong>{lowStock}</strong></div>
        <div className="card inventory-stat-card"><span>Out of Stock</span><strong>{outOfStock}</strong></div>
        <div className="card inventory-stat-card"><span>Value</span><strong>Rs {toMoney(inventoryValue)}</strong></div>
      </div>

      <div className="inventory-card-grid">
        {filteredRows.slice(0, 6).map((row) => (
          <button key={`card-${row.store_id}-${row.product_id}`} className="inventory-product-card" onClick={() => isAdmin ? openEditProduct(row) : undefined}>
            <span className={`inventory-status-dot ${row.stock_status || 'in_stock'}`} />
            <div>
              <strong>{row.name}</strong>
              <span>{row.job_id || row.sku} | {row.imei || row.barcode || 'No serial'}</span>
            </div>
            <b>{row.quantity}</b>
          </button>
        ))}
      </div>

      <div className="card inventory-table-wrap">
        <div className="inventory-table-header">
          <strong>Store Inventory</strong>
          <span>Estimated value: Rs {toMoney(inventoryValue)}</span>
        </div>
        <table className="inventory-table-modern">
          <thead>
            <tr>
              <th>Job / Product</th>
              <th>Device</th>
              <th>Identity</th>
              <th>Store</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Supplier</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row) => (
              <tr key={`${row.store_id}-${row.product_id}`}>
                <td>
                  <strong>{row.job_id || '-'}</strong>
                  <span>{row.product_code || row.sku}</span>
                </td>
                <td>
                  <strong>{row.name}</strong>
                  <span>{[row.brand, row.model, row.storage, row.color].filter(Boolean).join(' ') || categoryLabels[row.category] || row.category}</span>
                </td>
                <td>
                  <strong>{row.imei || row.serial_number || row.barcode || '-'}</strong>
                  <span>{row.sku}</span>
                </td>
                <td>
                  <strong>{row.store_name || visibleStores.find((store) => store.id === row.store_id)?.name || '-'}</strong>
                  <span>{categoryLabels[row.category] || row.category}</span>
                </td>
                <td>
                  <strong>Rs {toMoney(row.final_price || row.unit_price)}</strong>
                  <span>Cost Rs {toMoney(row.purchase_price)}</span>
                </td>
                <td>
                  <strong className={row.quantity <= row.min_stock_level ? 'stock-warn' : ''}>{row.quantity}</strong>
                  <span>{statusLabels[row.stock_status || 'in_stock']} | Min {row.min_stock_level}</span>
                </td>
                <td>
                  <strong>{row.supplier_name || '-'}</strong>
                  <span>{row.purchase_date || row.supplier_contact || '-'}</span>
                </td>
                <td>
                  <div className="inventory-row-actions">
                    {isAdmin && <button className="btn btn-sm" onClick={() => openEditProduct(row)}>Edit</button>}
                    {isAdmin && <button className="btn btn-sm btn-secondary" onClick={() => openTransfer(row)}>Transfer</button>}
                    {isAdmin && <button className="btn btn-sm btn-danger" onClick={() => void removeProduct(row)}>Delete</button>}
                    {isManager && <button className="btn btn-sm" onClick={() => void requestManagerChange(row)}>Request</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && pagedRows.length === 0 && (
              <tr>
                <td colSpan={8} className="inventory-empty">No inventory found for this store and filter.</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={8} className="inventory-empty">Loading inventory...</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="inventory-pagination">
          <span>Page {page} of {pageCount}</span>
          <div>
            <button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Prev</button>
            <button className="btn btn-sm btn-secondary" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button>
          </div>
        </div>
      </div>

      {showProductModal && (
        <div className="inventory-modal-backdrop" role="presentation">
          <form className="inventory-modal card" onSubmit={submitProduct}>
            <div className="inventory-modal-head">
              <div>
                <h2>{editingRow ? 'Edit Product' : 'New Product'}</h2>
                <p>{visibleStores.find((store) => store.id === selectedStoreId)?.name || 'Selected Store'}</p>
              </div>
              <button type="button" className="inventory-modal-close" onClick={() => setShowProductModal(false)}>x</button>
            </div>

            <div className="inventory-form-grid">
              {[
                ['job_id', 'Job ID'], ['product_code', 'Product ID'], ['sku', 'SKU'], ['barcode', 'Barcode'],
                ['imei', 'IMEI'], ['serial_number', 'Serial No'], ['name', 'Product Name'], ['brand', 'Brand'],
                ['model', 'Model'], ['variant', 'Variant'], ['ram', 'RAM'], ['storage', 'Storage'],
                ['color', 'Color'], ['purchase_price', 'Purchase Price'], ['price', 'Selling Price'], ['discount', 'Discount'],
                ['tax', 'Tax %'], ['stock_quantity', 'Quantity'], ['min_stock_level', 'Min Alert'], ['supplier_name', 'Supplier'],
                ['supplier_contact', 'Supplier Contact'], ['purchase_date', 'Purchase Date'],
              ].map(([key, label]) => (
                <label key={key}>
                  <span style={fieldLabelStyle}>{label}</span>
                  <input
                    className="form-input"
                    type={key.includes('price') || key === 'discount' || key === 'tax' || key.includes('quantity') || key.includes('level') ? 'number' : key === 'purchase_date' ? 'date' : 'text'}
                    value={String(productForm[key as keyof ProductForm] || '')}
                    onChange={(event) => setProductForm((prev) => ({ ...prev, [key]: event.target.value }))}
                    required={['sku', 'name', 'price'].includes(key)}
                  />
                </label>
              ))}
              <label>
                <span style={fieldLabelStyle}>Category</span>
                <select className="form-input" value={productForm.category} onChange={(event) => setProductForm((prev) => ({ ...prev, category: event.target.value as ProductForm['category'] }))}>
                  <option value="new_phone">New Phone</option>
                  <option value="used_phone">Used Phone</option>
                  <option value="accessories">Accessory</option>
                  <option value="services">Service</option>
                </select>
              </label>
              <label>
                <span style={fieldLabelStyle}>Condition</span>
                <select className="form-input" value={productForm.condition} onChange={(event) => setProductForm((prev) => ({ ...prev, condition: event.target.value as ProductForm['condition'] }))}>
                  <option value="new">New</option>
                  <option value="used">Used</option>
                  <option value="refurbished">Refurbished</option>
                  <option value="open_box">Open Box</option>
                  <option value="damaged">Damaged</option>
                </select>
              </label>
              <label className="inventory-field-wide">
                <span style={fieldLabelStyle}>Remarks</span>
                <textarea className="form-input" value={productForm.remarks || ''} onChange={(event) => setProductForm((prev) => ({ ...prev, remarks: event.target.value }))} />
              </label>
              <label className="inventory-field-wide">
                <span style={fieldLabelStyle}>Device Notes</span>
                <textarea className="form-input" value={productForm.device_notes || ''} onChange={(event) => setProductForm((prev) => ({ ...prev, device_notes: event.target.value }))} />
              </label>
            </div>

            <div className="inventory-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowProductModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Product'}</button>
            </div>
          </form>
        </div>
      )}

      {showTransferModal && (
        <div className="inventory-modal-backdrop" role="presentation">
          <form className="inventory-transfer-modal card" onSubmit={submitTransfer}>
            <div className="inventory-modal-head">
              <div>
                <h2>Stock Transfer</h2>
                <p>{transferRow?.name || 'Select a product row first'}</p>
              </div>
              <button type="button" className="inventory-modal-close" onClick={() => setShowTransferModal(false)}>x</button>
            </div>
            <label>
              <span style={fieldLabelStyle}>Destination Store</span>
              <select className="form-input" value={transferForm.to_store_id} onChange={(event) => setTransferForm((prev) => ({ ...prev, to_store_id: event.target.value }))} required>
                <option value="">Select Store</option>
                {activeStores.filter((store) => store.id !== selectedStoreId).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </label>
            <label>
              <span style={fieldLabelStyle}>Quantity</span>
              <input className="form-input" type="number" min="1" max={transferRow?.quantity || undefined} value={transferForm.quantity} onChange={(event) => setTransferForm((prev) => ({ ...prev, quantity: event.target.value }))} required />
            </label>
            <label>
              <span style={fieldLabelStyle}>Reason</span>
              <textarea className="form-input" value={transferForm.reason} onChange={(event) => setTransferForm((prev) => ({ ...prev, reason: event.target.value }))} required />
            </label>
            <div className="inventory-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowTransferModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving || !transferRow}>{saving ? 'Transferring...' : 'Transfer Stock'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Inventory;
