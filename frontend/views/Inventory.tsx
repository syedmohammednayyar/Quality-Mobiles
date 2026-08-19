import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from '../types';
import { formatDateTime } from '../utils/dateFormat';
import { calculateMargin, type MarginStatus } from '../utils/margin';
import { LossWarning, MarginAmount, MarginBadge, MarginPercent, MarginSummaryPanel } from '../components/MarginBadge';
import { useStoreSelection } from '../context/StoreSelectionContext';
import {
  createProduct,
  deleteProduct,
  getProductHistory,
  getProductPreview,
  getProductStockByStore,
  listStoreInventory,
  listProductTransferHistory,
  listTransferDestinationStores,
  transferInventoryStock,
  updateProduct,
  type ApiProductHistoryEntry,
  type ApiProductPreview,
  type ApiProductStoreStock,
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
/** Product master fields an Admin can edit inline — each requires a remark. */
type EditableField = 'purchase_price' | 'selling_price' | 'inventory_status';

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

  // The store picker in the header is the single source of truth for what this
  // page shows. "All Stores" is a real consolidated view here — every row is
  // labelled with the store that actually holds it — rather than a silent
  // fallback to whichever store happened to sort first.
  const { selectedStoreId: headerStoreId, isAllStores } = useStoreSelection();
  const viewStoreIds = useMemo(() => {
    if (managerStoreId) return visibleStores.filter((store) => store.id === managerStoreId).map((store) => store.id);
    if (isAllStores) return visibleStores.map((store) => store.id);
    const match = visibleStores.find((store) => store.id === headerStoreId);
    return match ? [match.id] : visibleStores.map((store) => store.id);
  }, [headerStoreId, isAllStores, managerStoreId, visibleStores]);
  const viewStoreKey = viewStoreIds.join(',');
  const isConsolidatedView = viewStoreIds.length > 1;
  const viewScopeLabel = isConsolidatedView
    ? `All Stores · ${viewStoreIds.length} stores`
    : visibleStores.find((store) => store.id === viewStoreIds[0])?.name || 'No store selected';

  // New stock always lands in exactly one store, so the form keeps its own
  // target: it follows the header while a single store is selected, and must
  // be chosen explicitly while the consolidated view is open.
  const [formStoreId, setFormStoreId] = useState('');
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
  // Every active store, regardless of who is logged in — the `stores` prop is
  // scoped to the user's own store, which leaves a Manager with no destination
  // to pick. Only the transfer modal uses this; the rest of the page stays on
  // the scoped list.
  const [destinationStores, setDestinationStores] = useState<ApiStore[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  // 'all' | 'PROFIT' | 'BREAK_EVEN' | 'LOSS' — lets a manager pull up every
  // product currently priced below cost in one step.
  const [marginFilter, setMarginFilter] = useState<'all' | MarginStatus>('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [detailRow, setDetailRow] = useState<ApiStoreInventoryRow | null>(null);
  const [transferHistory, setTransferHistory] = useState<ApiProductTransferHistory[]>([]);
  const [productHistory, setProductHistory] = useState<ApiProductHistoryEntry[]>([]);
  const [storeStock, setStoreStock] = useState<{ rows: ApiProductStoreStock[]; total_stock: number } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // The Preview popup is deliberately separate from Details: Details is the
  // working view of a stock row, Preview is the read-only review of a record
  // that was revised after a sale.
  const [previewRow, setPreviewRow] = useState<ApiStoreInventoryRow | null>(null);
  const [preview, setPreview] = useState<ApiProductPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{ row: ApiStoreInventoryRow; field: EditableField; label: string; oldValue: string; newValue: string } | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [transferQuantity, setTransferQuantity] = useState(1);
  const [transferReason, setTransferReason] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const modelRef = useRef<HTMLInputElement>(null);

  const isAdmin = user.role === 'Admin';
  const isManager = user.role === 'Manager';
  const pageSize = 25;

  useEffect(() => {
    if (visibleStores.length === 0) {
      setRows([]);
      setLoading(false);
    }
  }, [visibleStores]);

  // Destinations are only needed by the transfer modal, so a failure here is
  // not worth breaking the page over — the dropdown just falls back to the
  // stores this user can already see.
  useEffect(() => {
    if (!isAdmin && !isManager) return;
    let cancelled = false;
    void listTransferDestinationStores()
      .then((rows) => { if (!cancelled) setDestinationStores(rows.filter((store) => store.is_active)); })
      .catch(() => { if (!cancelled) setDestinationStores([]); });
    return () => { cancelled = true; };
  }, [isAdmin, isManager]);

  const transferDestinations = useMemo(() => {
    const pool = destinationStores.length > 0 ? destinationStores : activeStores;
    return transferRow ? pool.filter((store) => store.id !== transferRow.store_id) : [];
  }, [activeStores, destinationStores, transferRow]);

  // Keep the add-to target aligned with what is on screen. In the consolidated
  // view there is no single answer, so the admin is asked to pick one.
  useEffect(() => {
    if (isConsolidatedView) {
      setFormStoreId((prev) => (visibleStores.some((store) => store.id === prev) ? prev : ''));
      return;
    }
    setFormStoreId(viewStoreIds[0] || '');
  }, [isConsolidatedView, viewStoreKey, visibleStores]);

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

  // Each store is queried on its own — the API scopes /inventory to a single
  // store — and the results are concatenated. Every row carries its own
  // store_id/store_name, so a merged list stays attributable.
  const loadInventory = async (storeIds: string[], searchOverride = debouncedSearch) => {
    if (storeIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const batches = await Promise.all(
        storeIds.map((storeId) => listStoreInventory(storeId, { search: searchOverride, limit: 500, offset: 0 })),
      );
      setRows(batches.flat());
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInventory(viewStoreIds);
  }, [viewStoreKey, debouncedSearch, inventoryRefreshKey]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, primary_store_ref: formStoreId || null }));
  }, [formStoreId]);

  const rememberedDefaults = useMemo(() => ({
    brand: form.brand,
    category: form.category,
    supplier_name: form.supplier_name,
  }), [form.brand, form.category, form.supplier_name]);

  // Margin is computed once per row here and reused by the table, the filter
  // and the summary, so the three can never disagree.
  const rowsWithMargin = useMemo(() => rows.map((row) => ({
    row,
    margin: calculateMargin({
      purchasePrice: row.purchase_price,
      sellingPrice: row.selling_price || row.unit_price,
    }),
  })), [rows]);

  const filteredRows = useMemo(() => {
    return rowsWithMargin.filter(({ row, margin }) => (
      // "retrieved" is not an inventory_status — a retrieved device is back on
      // the shelf as "ready". It is a separate axis: which records were revised
      // after a sale and therefore have something to preview.
      (statusFilter === 'all'
        || (statusFilter === 'retrieved' ? Boolean(row.retrieved_from_sale) : row.inventory_status === statusFilter))
      && (brandFilter === 'all' || row.brand === brandFilter)
      // Products with no recorded cost cannot be judged, so they are excluded
      // from margin filtering rather than silently counted as break-even.
      && (marginFilter === 'all' || (!margin.costUnknown && margin.status === marginFilter))
    )).map(({ row }) => row).sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'price') return (Number(a.final_price || a.unit_price) - Number(b.final_price || b.unit_price)) * dir;
      if (sortKey === 'value') return (Number(a.final_price || a.unit_price) - Number(b.final_price || b.unit_price)) * dir;
      if (sortKey === 'updated') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir;
      return a.name.localeCompare(b.name) * dir;
    });
  }, [rowsWithMargin, sortDir, sortKey, statusFilter, brandFilter, marginFilter]);

  const marginOf = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateMargin>>();
    rowsWithMargin.forEach(({ row, margin }) => map.set(`${row.store_id}-${row.product_id}`, margin));
    return map;
  }, [rowsWithMargin]);

  const lossMakingCount = useMemo(
    () => rowsWithMargin.filter(({ margin }) => margin.isLoss).length,
    [rowsWithMargin],
  );

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [debouncedSearch, viewStoreKey, sortKey, sortDir]);

  const summary = useMemo(() => {
    const totalProducts = filteredRows.length;
    const totalValue = filteredRows.filter((row) => row.quantity > 0).reduce((sum, row) => sum + Number(row.final_price || row.unit_price), 0);
    const availableStock = filteredRows.filter((row) => row.quantity > 0).length;
    const stock4g = filteredRows.filter((row) => row.network_type === '4G').length;
    const stock5g = filteredRows.filter((row) => row.network_type === '5G').length;
    const soldRecords = filteredRows.filter((row) => row.quantity <= 0).length;
    // Counted across every loaded row, not the filtered set — this KPI is the
    // way into the filter, so it must not read zero once the filter is on.
    const retrievedRecords = rows.filter((row) => row.retrieved_from_sale).length;
    return { totalProducts, totalValue, availableStock, stock4g, stock5g, soldRecords, retrievedRecords };
  }, [filteredRows, rows]);

  const updateForm = (patch: Partial<ProductForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const resetForNext = () => {
    setForm(buildBlankForm(formStoreId, rememberedDefaults));
    window.setTimeout(() => modelRef.current?.focus(), 0);
  };

  const buildPayload = (source: ProductForm): CreateProductPayload => ({
    ...source,
    sku: source.sku || makeSku(source),
    name: source.name || productName(source),
    price: source.price || source.purchase_price || '0',
    // Every device is a distinct unit identified by its own IMEI/job number,
    // so each entry always represents exactly one product.
    stock_quantity: 1,
    min_stock_level: 0,
    primary_store_ref: formStoreId,
    inventory_mode: 'bulk',
  });

  const saveProduct = async (addNext: boolean) => {
    setSaving(true);
    setError('');
    setStatusMessage('');
    try {
      if (!formStoreId) throw new Error('Select the store this product belongs to before saving.');
      if (!form.job_id?.trim()) throw new Error('Job Number is required.');
      if (rows.some((row) => row.job_id.toLowerCase() === form.job_id?.trim().toLowerCase())) throw new Error('Job Number already exists.');
      await createProduct(buildPayload(form));
      const targetStore = visibleStores.find((store) => store.id === formStoreId)?.name;
      setStatusMessage(targetStore ? `Product added to ${targetStore}.` : 'Product added.');
      setSearch('');
      setDebouncedSearch('');
      setPage(1);
      await loadInventory(viewStoreIds, '');
      if (addNext) resetForNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  // Price/status changes are meaningful business edits — the backend requires
  // a remark for them (audit trail), so instead of saving on blur/change we
  // open a small confirm-with-remark step first. A no-op edit (value
  // unchanged) skips the prompt entirely.
  const requestInlineChange = (row: ApiStoreInventoryRow, field: EditableField, value: string) => {
    if (!isAdmin) {
      setError('You do not have permission to edit product details. Only an administrator can change product master data.');
      return;
    }
    const currentValue = field === 'purchase_price'
      ? String(row.purchase_price ?? '')
      : field === 'selling_price'
        ? String(row.selling_price || row.unit_price || '')
        : (row.inventory_status || 'ready');

    const isMoney = field !== 'inventory_status';
    // Compare numerically for prices so "100" vs "100.00" isn't a false change.
    const unchanged = isMoney
      ? Number(currentValue || 0) === Number(value || 0)
      : String(currentValue) === String(value);
    if (unchanged) return;

    setError('');
    setRemarkText('');
    setPendingEdit({
      row,
      field,
      label: field === 'purchase_price' ? 'Purchase Price' : field === 'selling_price' ? 'Selling Price' : 'Status',
      oldValue: isMoney ? `Rs ${toMoney(currentValue)}` : String(currentValue).replace(/_/g, ' '),
      newValue: isMoney ? `Rs ${toMoney(value)}` : String(value).replace(/_/g, ' '),
    });
  };

  const confirmPendingEdit = async () => {
    if (!pendingEdit) return;
    if (!remarkText.trim()) { setError('A remark is required to save this change.'); return; }
    const { row, field } = pendingEdit;
    const payload: Partial<CreateProductPayload> = {
      // The row's own store, not the page scope — in the consolidated view the
      // edited product may belong to a store other than the add-to target.
      primary_store_ref: row.store_id,
      sku: row.sku,
      name: row.name,
      remark: remarkText.trim(),
    };
    const rawValue = pendingEdit.newValue.replace(/[^0-9.]/g, '');
    if (field === 'purchase_price') {
      payload.purchase_price = rawValue;
    } else if (field === 'selling_price') {
      payload.price = rawValue;
    } else if (field === 'inventory_status') {
      payload.inventory_status = pendingEdit.newValue.replace(/ /g, '_') as CreateProductPayload['inventory_status'];
    }

    try {
      setError('');
      const saved = await updateProduct(row.product_id, payload);
      // Returning a sold device to stock reverses its sale line, which moves
      // revenue on the Dashboard and Sales History. Say so — a silent "saved"
      // left staff unable to tell whether the money had come back off.
      const reversed = saved.retrieval;
      setStatusMessage(reversed
        ? `Change saved. Sale ${reversed.saleNo} reduced by Rs ${Math.round(reversed.retrievedAmount).toLocaleString()} — Dashboard revenue and Sales History have been updated.`
        : 'Change saved and recorded in the audit history.');
      setPendingEdit(null);
      setRemarkText('');
      await loadInventory(viewStoreIds);
      // A retrieval moves sales figures, not just stock. This page reloads its
      // own rows above, but nothing else announces the sales-side change, so a
      // screen listening for it would otherwise keep pre-reversal totals.
      if (reversed) window.dispatchEvent(new CustomEvent('sales:changed', { detail: { saleId: reversed.saleId } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save change');
    }
  };

  // Re-pulls just the audit trail for the open product (the "Refresh" action).
  const openHistory = async () => {
    if (!detailRow) return;
    setHistoryLoading(true);
    try {
      setProductHistory(await getProductHistory(detailRow.product_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load change history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const openTransfer = (row: ApiStoreInventoryRow) => {
    setTransferRow(row);
    setTransferStoreId('');
    setTransferQuantity(1);
    setTransferReason('Stock replenishment');
    setTransferNotes('');
  };

  // One entry point for the product popup: stock, transfer history and the
  // audit/change history are all fetched together, so "Details" and "History"
  // are a single action rather than two buttons opening the same modal.
  const openDetails = async (row: ApiStoreInventoryRow) => {
    setDetailRow(row);
    setTransferHistory([]);
    setProductHistory([]);
    setStoreStock(null);
    setHistoryLoading(true);
    try {
      const [transfers, stock, changes] = await Promise.all([
        listProductTransferHistory(row.product_id),
        getProductStockByStore(row.product_id),
        getProductHistory(row.product_id),
      ]);
      setTransferHistory(transfers);
      setStoreStock(stock);
      setProductHistory(changes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load product details');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Preview is a review action, not an edit path: it opens the popup straight
  // away and fills it in when the data lands, so a slow request never leaves
  // the user staring at an unchanged screen wondering if the click registered.
  const openPreview = async (row: ApiStoreInventoryRow) => {
    setPreviewRow(row);
    setPreview(null);
    setPreviewLoading(true);
    try {
      setPreview(await getProductPreview(row.product_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load product preview');
      setPreviewRow(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const submitTransfer = async () => {
    if (!transferRow || !transferStoreId) return;
    if (transferQuantity <= 0) { setError('Transfer quantity must be greater than zero.'); return; }
    if (transferQuantity > transferRow.quantity) { setError(`Only ${transferRow.quantity} units are available.`); return; }
    if (!transferReason.trim()) { setError('A reason is required for the transfer.'); return; }
    setSaving(true);
    setError('');
    setStatusMessage('');
    try {
      await transferInventoryStock({
        from_store_id: transferRow.store_id,
        to_store_id: transferStoreId,
        product_id: transferRow.product_id,
        quantity: transferQuantity,
        reason: transferReason.trim(),
        notes: transferNotes.trim() || undefined,
      });
      setStatusMessage('Product transferred. POS visibility updated.');
      setTransferRow(null);
      setTransferStoreId('');
      window.dispatchEvent(new CustomEvent('inventory:changed', {
        detail: { storeIds: [transferRow.store_id, transferStoreId], productId: transferRow.product_id },
      }));
      await loadInventory(viewStoreIds, '');
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
      await loadInventory(viewStoreIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product');
    }
  };

  const modelOptions = [...new Set([...(modelMap[form.brand] || []), ...rows.filter((row) => row.brand === form.brand).map((row) => row.model).filter(Boolean)])];

  return (
    <div className="inventory-page">
      <section className="inventory-entry-shell">
        <div className="module-header inventory-entry-head">
          <div>
            <h1>Inventory</h1>
            <p>Manage stock levels, pricing, transfers and product audit history.</p>
          </div>
          <span className="inventory-scope-chip" title="Set by the store picker in the header">
            <span className="material-icons">store</span>
            {viewScopeLabel}
          </span>
        </div>

        <form className="inventory-fast-form" onSubmit={(event) => { event.preventDefault(); void saveProduct(true); }}>
          <label>
            <span>Store{isConsolidatedView ? ' (required)' : ''}</span>
            {/* Locked to the store on screen unless every store is shown at
                once, where the admin must say where the stock is landing. */}
            <select value={formStoreId} onChange={(event) => setFormStoreId(event.target.value)} disabled={isManager || !isConsolidatedView}>
              {isConsolidatedView && <option value="">Select store</option>}
              {visibleStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
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
          {/* Warns as soon as both prices are entered. Non-blocking by design —
              clearance and damaged stock are legitimate below-cost sales. */}
          <div className="inventory-form-wide">
            <LossWarning result={calculateMargin({ purchasePrice: form.purchase_price, sellingPrice: form.price })} />
          </div>
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
            <span>Availability</span>
            <select value={form.inventory_status || 'ready'} onChange={(event) => updateForm({ inventory_status: event.target.value as ProductForm['inventory_status'] })}>
              <option value="ready">Ready for Sale</option>
              <option value="under_repair">Under Repair</option>
            </select>
          </label>
          <div className="inventory-form-actions">
            <span className={`inventory-form-context${formStoreId ? '' : ' unset'}`}>
              {formStoreId
                ? <>Adding to <strong>{visibleStores.find((s) => s.id === formStoreId)?.name}</strong></>
                : <>Select a store above — inventory is always recorded against one store</>}
            </span>
            <button type="button" className="btn btn-secondary" onClick={resetForNext}>Clear</button>
            <button type="button" className="btn btn-secondary" disabled={saving || !formStoreId} onClick={() => void saveProduct(false)}>{saving ? 'Saving...' : 'Save'}</button>
            <button className="btn btn-primary" disabled={saving || !formStoreId}>{saving ? 'Saving...' : 'Save & Add Next'}</button>
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
        <button
          type="button"
          className={`inventory-kpi-action${statusFilter === 'sold' ? ' active' : ''}`}
          title="Show only sold / historical records"
          onClick={() => setStatusFilter(statusFilter === 'sold' ? 'all' : 'sold')}
        >
          <span>History Records</span>
          <strong>{summary.soldRecords}</strong>
          <em>{statusFilter === 'sold' ? 'Showing — click to clear' : 'Click to view'}</em>
        </button>
        <button
          type="button"
          className={`inventory-kpi-action${statusFilter === 'retrieved' ? ' active' : ''}`}
          title="Show only records retrieved from a completed sale and revised back into stock"
          onClick={() => setStatusFilter(statusFilter === 'retrieved' ? 'all' : 'retrieved')}
        >
          <span>Retrieved / Revised</span>
          <strong>{summary.retrievedRecords}</strong>
          <em>{statusFilter === 'retrieved' ? 'Showing — click to clear' : 'Click to review'}</em>
        </button>
      </section>

      <section className="inventory-table-panel">
        <div className="inventory-scope-bar">
          <span>Showing inventory for <strong>{viewScopeLabel}</strong></span>
          {isConsolidatedView
            ? <em>Use the store picker in the header to narrow this to one store.</em>
            : <em>Every record below is held by this store.</em>}
        </div>
        <div className="inventory-table-tools">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job, product code, SKU, IMEI, brand, model..." />
          <div className="inventory-sort-controls">
            <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
              <option value="all">All Brands</option>
              {[...new Set(rows.map((row) => row.brand).filter(Boolean))].sort().map((brand) => <option key={brand} value={brand}>{brand}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Statuses</option><option value="ready">Ready for Sale</option><option value="under_repair">Under Repair</option><option value="sold">Sold</option><option value="retrieved">Retrieved / Revised</option>
            </select>
            <select value={marginFilter} onChange={(event) => setMarginFilter(event.target.value as 'all' | MarginStatus)} title="Filter by pricing margin">
              <option value="all">All Margins</option>
              <option value="LOSS">Loss-Making Only{lossMakingCount > 0 ? ` (${lossMakingCount})` : ''}</option>
              <option value="BREAK_EVEN">Break-Even</option>
              <option value="PROFIT">Profitable</option>
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
                <th>Margin</th>
                <th>Margin %</th>
                <th>Margin Status</th>
                <th>Product Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => {
                const margin = marginOf.get(`${row.store_id}-${row.product_id}`)!;
                return (
                <tr key={`${row.store_id}-${row.product_id}`} className={margin.isLoss ? 'row-loss' : undefined}>
                  <td><strong>{row.job_id || '-'}</strong></td>
                  <td><strong>{row.brand || '-'}</strong></td>
                  <td><strong>{row.model || '-'}</strong></td>
                  <td><strong>{row.imei || '-'}</strong></td>
                  <td><strong>{row.store_name || visibleStores.find((store) => store.id === row.store_id)?.name || '-'}</strong></td>
                  <td>{isAdmin
                    ? <input key={`pp-${row.product_id}-${row.purchase_price}`} className="inline-input money" type="number" min="0" defaultValue={row.purchase_price ?? ''} onBlur={(event) => requestInlineChange(row, 'purchase_price', event.target.value)} title="Admin only — a remark is required to save" />
                    : <strong>Rs {toMoney(row.purchase_price)}</strong>}</td>
                  <td>{isAdmin
                    ? <input key={`sp-${row.product_id}-${row.selling_price || row.unit_price}`} className="inline-input money" type="number" min="0" defaultValue={row.selling_price || row.unit_price || ''} onBlur={(event) => requestInlineChange(row, 'selling_price', event.target.value)} title="Admin only — a remark is required to save" />
                    : <strong>Rs {toMoney(Number(row.selling_price || row.unit_price))}</strong>}</td>
                  <td><MarginAmount result={margin} /></td>
                  <td><MarginPercent result={margin} /></td>
                  <td><MarginBadge result={margin} /></td>
                  <td><span className={row.category === 'used_phone' ? 'inventory-type used' : 'inventory-type new'}>{row.category === 'used_phone' ? 'USED PHONE' : 'NEW'}</span></td>
                  <td>
                    {isAdmin ? (
                      <select className="inline-input" value={row.inventory_status || 'ready'} onChange={(event) => requestInlineChange(row, 'inventory_status', event.target.value)}>
                        <option value="ready">Ready for Sale</option>
                        <option value="under_repair">Under Repair</option>
                        <option value="sold">Sold</option>
                      </select>
                    ) : (
                      <span className={`inventory-status ${row.inventory_status || 'ready'}`} title={row.inventory_status === 'under_repair' ? 'In buyback inventory but not currently sellable' : undefined}>{row.inventory_status === 'under_repair' ? '🔴 Under Repair' : row.inventory_status === 'ready' ? '🟢 Ready for Sale' : (row.inventory_status || 'ready')}</span>
                    )}
                    {/* The status alone says "Ready for Sale" again, which hides
                        that this device came back out of a sale. The marker is
                        what tells an Admin/Manager there is a revision to review. */}
                    {row.retrieved_from_sale && (
                      <span className="inventory-revised-tag" title={`Retrieved from sale ${row.retrieved_sale_no || ''}${row.last_retrieved_at ? ` on ${formatDateTime(row.last_retrieved_at)}` : ''}`}>
                        ↩ Revised
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="inventory-row-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => void openDetails(row)}>Details</button>
                      {(isAdmin || isManager) && row.retrieved_from_sale && (
                        <button className="btn btn-sm btn-preview" title="Review the revised record: the sale it was retrieved from, the remark, and current stock" onClick={() => void openPreview(row)}>Preview</button>
                      )}
                      {(isAdmin || isManager) && row.quantity > 0 && row.inventory_status !== 'sold' && row.active !== false && <button className="btn btn-sm btn-secondary" onClick={() => openTransfer(row)}>Transfer</button>}
                      {isAdmin && <button className="btn btn-sm btn-danger" onClick={() => void removeProduct(row)}>Delete</button>}
                    </div>
                  </td>
                </tr>
                );
              })}
              {!loading && pagedRows.length === 0 && <tr><td colSpan={13} className="inventory-empty">
                <strong>No products found</strong>
                <span>Nothing matches {[
                  debouncedSearch && `"${debouncedSearch}"`,
                  brandFilter !== 'all' && brandFilter,
                  statusFilter !== 'all' && statusFilter.replace(/_/g, ' '),
                  marginFilter !== 'all' && `${marginFilter.replace(/_/g, '-').toLowerCase()} margin`,
                  viewScopeLabel,
                ].filter(Boolean).join(' · ') || 'the current filters'}. Try changing the search, brand or status filter.</span>
              </td></tr>}
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
        <div className="inventory-detail-backdrop" onClick={() => setTransferRow(null)}>
          <div className="inventory-transfer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="inventory-modal-head">
              <div><h2>Transfer Inventory</h2><p>Move stock between stores. Both stores keep a full movement history.</p></div>
              <button type="button" onClick={() => setTransferRow(null)} aria-label="Close">x</button>
            </div>

            <div className="inventory-transfer-grid">
              <label><span>From Store</span><input value={transferRow.store_name || '-'} disabled /></label>
              <label><span>To Store</span>
                <select value={transferStoreId} onChange={(event) => setTransferStoreId(event.target.value)}>
                  <option value="">Select destination</option>
                  {transferDestinations.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </label>
              <label className="inventory-form-wide"><span>Product</span><input value={`${transferRow.name}${transferRow.job_id ? ` · ${transferRow.job_id}` : ''}`} disabled /></label>
              <label><span>Available</span><input value={transferRow.quantity} disabled /></label>
              <label><span>Transfer Quantity</span>
                <input type="number" min={1} max={transferRow.quantity} value={transferQuantity}
                  onChange={(event) => setTransferQuantity(Math.max(1, Number(event.target.value || 1)))} />
              </label>
              <label className="inventory-form-wide"><span>Reason</span>
                <input value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="e.g. Stock replenishment" />
              </label>
              <label className="inventory-form-wide"><span>Notes (optional)</span>
                <input value={transferNotes} onChange={(event) => setTransferNotes(event.target.value)} placeholder="Anything worth recording against this movement" />
              </label>
            </div>

            {transferDestinations.length === 0 && <p className="inventory-state inventory-state-error">No other active store is available to receive this transfer.</p>}
            {transferQuantity > transferRow.quantity && <p className="inventory-state inventory-state-error">Only {transferRow.quantity} unit{transferRow.quantity === 1 ? '' : 's'} are available.</p>}
            {error && <p className="inventory-state inventory-state-error">{error}</p>}

            <div className="inventory-modal-actions">
              <button className="btn btn-secondary" onClick={() => { setTransferRow(null); setError(''); }}>Cancel</button>
              <button className="btn btn-primary" disabled={!transferStoreId || saving || transferQuantity > transferRow.quantity} onClick={() => void submitTransfer()}>{saving ? 'Transferring...' : 'Create Transfer'}</button>
            </div>
          </div>
        </div>
      )}
      {detailRow && (
        <div className="inventory-detail-backdrop">
          <div className="inventory-detail-modal">
            <div className="inventory-modal-head"><div><h2>{detailRow.job_id}</h2><p>{detailRow.brand} {detailRow.model}</p></div><button onClick={() => setDetailRow(null)}>x</button></div>

            <h3>Product Overview</h3>
            <div className="inventory-detail-grid">
              <div><span>Product</span><strong>{detailRow.name}</strong></div>
              <div><span>Brand / Model</span><strong>{detailRow.brand} {detailRow.model}</strong></div>
              <div><span>SKU</span><strong>{detailRow.sku || '-'}</strong></div>
              <div><span>IMEI</span><strong>{detailRow.imei || '-'}</strong></div>
              <div><span>Product Type</span><strong>{detailRow.category === 'used_phone' ? 'Used Phone (Buyback)' : 'New Phone'}</strong></div>
              <div><span>Status</span><strong className={detailRow.inventory_status === 'under_repair' ? 'text-loss' : detailRow.inventory_status === 'ready' ? 'text-profit' : ''}>{detailRow.inventory_status === 'under_repair' ? '🔴 Under Repair' : detailRow.inventory_status === 'ready' ? '🟢 Ready for Sale' : (detailRow.inventory_status || 'ready')}</strong></div>
            </div>

            <h3>Pricing</h3>
            <div className="inventory-detail-grid">
              <div><span>Purchase Price</span><strong>Rs {toMoney(detailRow.purchase_price)}</strong></div>
              <div><span>Selling Price</span><strong>Rs {toMoney(detailRow.selling_price || detailRow.unit_price)}</strong></div>
              <div><span>Final Price</span><strong>Rs {toMoney(detailRow.final_price || detailRow.unit_price)}</strong></div>
            </div>
            {/* The same margin rule as the listing — a product priced below cost
                is identifiable here without any mental arithmetic. */}
            <MarginSummaryPanel
              result={calculateMargin({
                purchasePrice: detailRow.purchase_price,
                sellingPrice: detailRow.final_price || detailRow.selling_price || detailRow.unit_price,
              })}
              title="Margin"
            />

            <h3>Store Stock{storeStock && <span className="inventory-total-stock">Total: {storeStock.total_stock}</span>}</h3>
            <div className="inventory-detail-grid">
              {!storeStock && <div><span>Loading</span><strong>Loading store stock...</strong></div>}
              {storeStock?.rows.map((row) => (
                <div key={row.store_id}>
                  <span>{row.store_name} &middot; {row.store_code}</span>
                  <strong className={row.quantity <= 0 ? 'text-muted' : row.stock_status === 'low_stock' ? 'text-warn' : ''}>
                    {row.quantity} available
                  </strong>
                </div>
              ))}
            </div>

            <h3>Stock Status</h3>
            <div className="inventory-detail-grid">
              <div><span>Current Stock ({detailRow.store_name})</span><strong>{detailRow.quantity}</strong></div>
              <div><span>Minimum Level</span><strong>{detailRow.min_stock_level}</strong></div>
              <div><span>Stock Status</span><strong>{detailRow.stock_status?.replace(/_/g, ' ') || '-'}</strong></div>
              <div><span>Last Updated</span><strong>{formatDateTime(detailRow.updated_at)}</strong></div>
            </div>

            <h3>Transfer History</h3>
            <div className="inventory-history">{transferHistory.map((entry) => <div key={entry.id}><strong>{entry.from_store_name} to {entry.to_store_name}</strong><span>{formatDateTime(entry.transferred_at)} | {entry.transferred_by || 'System'} | {entry.remarks}</span></div>)}{transferHistory.length === 0 && <p>No transfer history.</p>}</div>

            <h3>Change History<button type="button" className="inventory-history-toggle" onClick={() => void openHistory()} disabled={historyLoading}>{historyLoading ? 'Loading...' : 'Refresh'}</button></h3>
            <div className="inventory-history">
              {historyLoading && <p>Loading change history...</p>}
              {!historyLoading && productHistory.length === 0 && <p>No recorded price or status changes for this product yet.</p>}
              {!historyLoading && productHistory.map((entry) => (
                <div key={entry.id} className="inventory-history-entry">
                  <strong>{entry.changed_by} &middot; {formatDateTime(entry.changed_at)}</strong>
                  {entry.changes.map((change) => <span key={change.field}>{change.field}: {String(change.old_value)} &rarr; {String(change.new_value)}</span>)}
                  {entry.remark && <em>"{entry.remark}"</em>}
                </div>
              ))}
            </div>

            <div className="inventory-modal-actions"><button className="btn btn-secondary" onClick={() => setDetailRow(null)}>Close</button>{(isAdmin || isManager) && detailRow.retrieved_from_sale && <button className="btn btn-preview" onClick={() => { const row = detailRow; setDetailRow(null); void openPreview(row); }}>Preview Revision</button>}{(isAdmin || isManager) && detailRow.quantity > 0 && detailRow.inventory_status !== 'sold' && <button className="btn btn-primary" onClick={() => { setDetailRow(null); openTransfer(detailRow); }}>Transfer</button>}</div>
          </div>
        </div>
      )}

      {previewRow && (
        <div className="inventory-detail-backdrop" onClick={() => { setPreviewRow(null); setPreview(null); }}>
          <div className="inventory-detail-modal inventory-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="inventory-modal-head">
              <div>
                <h2>Preview &middot; {previewRow.job_id || previewRow.sku}</h2>
                <p>{previewRow.brand} {previewRow.model} &middot; Revised record, read-only</p>
              </div>
              <button type="button" onClick={() => { setPreviewRow(null); setPreview(null); }} aria-label="Close">x</button>
            </div>

            {previewLoading && <p className="inventory-preview-loading">Loading the revised record...</p>}

            {!previewLoading && preview && (
              <>
                {/* The headline answer first: what came back, off which sale and
                    for how much. Everything below is the supporting detail. */}
                <div className={`inventory-preview-banner${preview.retrieved ? '' : ' neutral'}`}>
                  {preview.retrieved ? (
                    <>
                      <strong>Retrieved from {preview.retrievals.length === 1 ? `sale ${preview.retrievals[0].sale_no}` : `${preview.retrievals.length} sales`}</strong>
                      <span>
                        Rs {toMoney(preview.retrieved_total)} reversed &middot; {preview.retrieved_quantity} unit{preview.retrieved_quantity === 1 ? '' : 's'} returned
                        {preview.last_retrieved_at ? ` · last on ${formatDateTime(preview.last_retrieved_at)}` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>No sale retrieval on this record</strong>
                      <span>This product has not been taken back out of a completed sale. Its revision history is shown below.</span>
                    </>
                  )}
                </div>

                <h3>Product Record</h3>
                <div className="inventory-detail-grid">
                  <div><span>Job Number</span><strong>{preview.product.job_id || '-'}</strong></div>
                  <div><span>Product</span><strong>{preview.product.name}</strong></div>
                  <div><span>Brand / Model</span><strong>{[preview.product.brand, preview.product.model].filter(Boolean).join(' ') || '-'}</strong></div>
                  <div><span>IMEI</span><strong>{preview.product.imei || '-'}</strong></div>
                  <div><span>Store</span><strong>{preview.product.store_name || previewRow.store_name || '-'}</strong></div>
                  <div><span>Current Status</span><strong className={preview.product.inventory_status === 'ready' ? 'text-profit' : preview.product.inventory_status === 'under_repair' ? 'text-loss' : ''}>{String(preview.product.inventory_status || 'ready').replace(/_/g, ' ')}</strong></div>
                  <div><span>Purchase Price</span><strong>Rs {toMoney(preview.product.purchase_price)}</strong></div>
                  <div><span>Selling Price</span><strong>Rs {toMoney(preview.product.selling_price || preview.product.price)}</strong></div>
                  <div><span>Units On Hand</span><strong>{preview.stock.total_stock}</strong></div>
                  <div><span>Last Updated</span><strong>{preview.product.updated_at ? formatDateTime(preview.product.updated_at) : formatDateTime(previewRow.updated_at)}</strong></div>
                </div>
                {preview.product.remarks && (
                  <p className="inventory-preview-remark"><span>Product remarks</span>{preview.product.remarks}</p>
                )}

                <h3>Retrieval Details</h3>
                <div className="inventory-history">
                  {preview.retrievals.length === 0 && <p>No retrieval recorded against this product.</p>}
                  {preview.retrievals.map((entry) => (
                    <div key={`${entry.sale_id}-${entry.retrieved_at}`} className="inventory-preview-retrieval">
                      <strong>
                        Sale {entry.sale_no}{entry.job_number ? ` · Job ${entry.job_number}` : ''}
                        <em className="inventory-sale-flag">{entry.fully_retrieved ? 'Fully retrieved' : 'Partially retrieved'}</em>
                      </strong>
                      <div className="inventory-detail-grid">
                        <div><span>Sold On</span><strong>{entry.sold_at ? formatDateTime(entry.sold_at) : '-'}</strong></div>
                        <div><span>Customer</span><strong>{entry.customer_name || '-'}</strong></div>
                        <div><span>Sold For (gross)</span><strong>Rs {toMoney(entry.gross_amount)}</strong></div>
                        {/* The net figure is the one that actually left revenue --
                            gross alone would overstate what the reversal moved. */}
                        <div><span>Reversed From Revenue</span><strong className="text-loss">Rs {toMoney(entry.net_amount)}</strong></div>
                        <div><span>Retrieved On</span><strong>{entry.retrieved_at ? formatDateTime(entry.retrieved_at) : '-'}</strong></div>
                        <div><span>Retrieved By</span><strong>{entry.retrieved_by || 'System'}</strong></div>
                        <div><span>Quantity Returned</span><strong>{entry.quantity}</strong></div>
                        <div><span>Sold From</span><strong>{entry.store_name || '-'}</strong></div>
                      </div>
                      {entry.retrieval_reason && <em>"{entry.retrieval_reason}"</em>}
                    </div>
                  ))}
                </div>

                <h3>Stock After Revision{preview.stock.total_stock > 0 && <span className="inventory-total-stock">Total: {preview.stock.total_stock}</span>}</h3>
                <div className="inventory-detail-grid">
                  {preview.stock.rows.length === 0 && <div><span>Stock</span><strong>No stock rows recorded.</strong></div>}
                  {preview.stock.rows.map((row) => (
                    <div key={row.store_id}>
                      <span>{row.store_name} &middot; {row.store_code}</span>
                      <strong className={row.quantity <= 0 ? 'text-muted' : row.stock_status === 'low_stock' ? 'text-warn' : ''}>{row.quantity} available</strong>
                    </div>
                  ))}
                </div>

                <h3>Revision Remarks</h3>
                <div className="inventory-history">
                  {preview.revisions.length === 0 && <p>No recorded revisions for this product.</p>}
                  {preview.revisions.map((entry) => (
                    <div key={entry.id} className="inventory-history-entry">
                      <strong>{entry.changed_by} &middot; {formatDateTime(entry.changed_at)}</strong>
                      {entry.changes.map((change) => <span key={change.field}>{change.field}: {String(change.old_value)} &rarr; {String(change.new_value)}</span>)}
                      {entry.remark && <em>"{entry.remark}"</em>}
                    </div>
                  ))}
                </div>

                <div className="inventory-modal-actions">
                  <button className="btn btn-secondary" onClick={() => { setPreviewRow(null); setPreview(null); }}>Close</button>
                  <button className="btn btn-primary" onClick={() => { const row = previewRow; setPreviewRow(null); setPreview(null); void openDetails(row); }}>Open Full Details</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {pendingEdit && (
        <div className="inventory-detail-backdrop">
          <div className="inventory-edit-confirm">
            <h2>Confirm Change</h2>
            <div className="inventory-edit-confirm-row"><span>{pendingEdit.label}</span><strong>{pendingEdit.oldValue} &rarr; {pendingEdit.newValue}</strong></div>
            {/* The margin this edit will produce, shown before it is saved. */}
            {pendingEdit.field !== 'inventory_status' && (() => {
              const next = Number(pendingEdit.newValue.replace(/[^0-9.]/g, '')) || 0;
              const result = calculateMargin(
                pendingEdit.field === 'purchase_price'
                  ? { purchasePrice: next, sellingPrice: pendingEdit.row.selling_price || pendingEdit.row.unit_price }
                  : { purchasePrice: pendingEdit.row.purchase_price, sellingPrice: next },
              );
              return <>
                <div className="inventory-edit-confirm-row">
                  <span>Resulting Margin</span>
                  <strong><MarginAmount result={result} /> &middot; <MarginPercent result={result} /> &middot; <MarginBadge result={result} /></strong>
                </div>
                <LossWarning result={result} />
              </>;
            })()}
            <label className="inventory-edit-remark-label">
              <span>Remark (required)</span>
              <textarea value={remarkText} onChange={(event) => setRemarkText(event.target.value)} placeholder="Why is this changing? e.g. Market price adjustment" rows={3} autoFocus />
            </label>
            {error && <p className="inventory-state inventory-state-error">{error}</p>}
            <div className="inventory-modal-actions">
              <button className="btn btn-secondary" onClick={() => { setPendingEdit(null); setError(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void confirmPendingEdit()}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
