import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PaymentMethod, User } from '../types';
import {
  createCustomer,
  createSale,
  listCustomers,
  listEmployees,
  listStoreInventory,
  listStores,
  isApiError,
  type ApiCustomer,
  type ApiEmployee,
  type ApiStoreInventoryRow,
  type ApiStore,
  type CustomerType,
} from '../services/api';
import { calculateCartMargins, marginClass, type MarginResult } from '../utils/margin';
import { MarginAmount, MarginBadge } from '../components/MarginBadge';
import './POS.css';

// ─── Types ─────────────────────────────────────────────────────────────────

type PosProduct = {
  id: string;
  productId: string;
  jobNo: string;
  name: string;
  brand: string;
  model: string;
  storage: string;
  network: string;
  price: number;
  purchasePrice: number;
  productType: string;
  inventoryStatus: 'ready' | 'under_repair' | string;
};

type AdjustmentCategory =
  | 'negotiation'
  | 'loyalty_discount'
  | 'damage'
  | 'bulk'
  | 'promotion'
  | 'manager_override'
  | 'other';

type PosCartItem = PosProduct & {
  adjustedPrice?: number;
  adjustmentReason?: string;
  adjustmentCategory?: AdjustmentCategory;
};

type ExchangeDeviceEntry = {
  localId: string;
  brand: string;
  model: string;
  imei?: string;
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'broken';
  exchangeValue: number;
  destinationStoreId: string;
  inventoryStatus: 'ready' | 'under_repair';
};

// ─── Constants ──────────────────────────────────────────────────────────────

const paymentMethods: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];
const POS_DRAFT_KEY = 'quality-mobiles-pos-draft';

const ADJUSTMENT_CATEGORIES: { value: AdjustmentCategory; label: string }[] = [
  { value: 'negotiation',       label: 'Negotiation' },
  { value: 'loyalty_discount',  label: 'Loyalty Discount' },
  { value: 'damage',            label: 'Damaged Item' },
  { value: 'bulk',              label: 'Bulk Purchase' },
  { value: 'promotion',         label: 'Promotion' },
  { value: 'manager_override',  label: 'Manager Override' },
  { value: 'other',             label: 'Other' },
];

const EXCHANGE_CONDITIONS: { value: ExchangeDeviceEntry['condition']; label: string }[] = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good',      label: 'Good' },
  { value: 'fair',      label: 'Fair' },
  { value: 'poor',      label: 'Poor' },
  { value: 'broken',    label: 'Broken' },
];

const toMoney = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const mapProduct = (product: ApiStoreInventoryRow): PosProduct => {
  const nameParts = [product.brand, product.model].filter(Boolean);
  return {
    id: String(product.product_id),
    productId: String(product.product_id),
    jobNo: product.job_id || product.product_code || product.sku || '-',
    name: nameParts.length ? nameParts.join(' ') : product.name,
    brand: product.brand || '',
    model: product.model || product.name,
    storage: product.storage || '-',
    network: product.network_type || '-',
    price: Number(product.unit_price || product.final_price || 0),
    purchasePrice: Number(product.purchase_price || 0),
    productType: product.category === 'used_phone' ? 'USED PHONE' : 'NEW',
    inventoryStatus: product.inventory_status || 'ready',
  };
};

// ─── Cart Item Row ──────────────────────────────────────────────────────────

interface CartItemRowProps {
  item: PosCartItem;
  margin:           MarginResult;
  onPriceChange:    (id: string, price: number) => void;
  onCategoryChange: (id: string, cat: AdjustmentCategory) => void;
  onReasonChange:   (id: string, reason: string) => void;
  onRemove:         (id: string) => void;
}

const CartItemRow: React.FC<CartItemRowProps> = ({ item, margin, onPriceChange, onCategoryChange, onReasonChange, onRemove }) => {
  const billedPrice = item.adjustedPrice ?? item.price;
  const priceChanged = billedPrice !== item.price;
  // Margin comes from the shared calculator, computed at cart level so this row
  // already carries its share of the bill-level discount. Preview only — the
  // backend remains the financial authority and this never blocks the sale.
  const hasCostBasis = !margin.costUnknown;

  return (
    <div className={`pos-cart-row${priceChanged ? ' price-adjusted' : ''}`}>
      <div className="pos-cart-row-info">
        <strong>{item.name}</strong>
        <span>{item.jobNo} | {item.storage} | {item.network}</span>
        {priceChanged && (
          <span className="pos-cart-original-price">
            List: Rs {toMoney(item.price)} &rarr; <em>adjusted −Rs {toMoney(item.price - billedPrice)}</em>
          </span>
        )}
        {hasCostBasis && (
          <span className={`pos-cost-indicator ${marginClass(margin.status)}`}>
            Cost: Rs {toMoney(item.purchasePrice)}
            {margin.discount > 0 && <> &middot; incl. Rs {toMoney(margin.discount)} bill discount</>}
            {' '}&middot; <MarginAmount result={margin} /> <MarginBadge result={margin} compact />
          </span>
        )}
      </div>

      <div className="pos-cart-price-wrap">
        <span className="pos-cart-price-label">Sale Price</span>
        <input
          type="number"
          min="0"
          className="pos-cart-price-input"
          value={billedPrice}
          onChange={(e) => onPriceChange(item.id, Number(e.target.value || 0))}
        />
      </div>

      <button type="button" className="pos-cart-remove" onClick={() => onRemove(item.id)} aria-label="Remove item">
        <span className="material-icons">close</span>
      </button>

      {priceChanged && (
        <div className="pos-adjustment-panel">
          <select
            className="pos-adjustment-select"
            value={item.adjustmentCategory || 'negotiation'}
            onChange={(e) => onCategoryChange(item.id, e.target.value as AdjustmentCategory)}
          >
            {ADJUSTMENT_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
          <input
            type="text"
            className="pos-adjustment-reason"
            placeholder="Reason (optional note)"
            value={item.adjustmentReason || ''}
            onChange={(e) => onReasonChange(item.id, e.target.value)}
          />
        </div>
      )}
    </div>
  );
};

// ─── POS Component ──────────────────────────────────────────────────────────

interface POSProps {
  user: User;
}

const POS: React.FC<POSProps> = ({ user }) => {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [currentStoreId, setCurrentStoreId] = useState('');
  const [cart, setCart] = useState<PosCartItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(POS_DRAFT_KEY) || '{}').cart || [];
    } catch {
      return [];
    }
  });
  const [exchangeDevices, setExchangeDevices] = useState<ExchangeDeviceEntry[]>([]);
  const [showExchangeForm, setShowExchangeForm] = useState(false);
  const [newDevice, setNewDevice] = useState<Omit<ExchangeDeviceEntry, 'localId'>>({
    brand: '', model: '', imei: '', condition: 'good', exchangeValue: 0, destinationStoreId: '', inventoryStatus: 'ready',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  // Customer Type is captured explicitly rather than assumed. Every sale used
  // to be filed as walk_in regardless of how the customer actually arrived,
  // which left the referral figure permanently zero.
  const [customerType, setCustomerType] = useState<CustomerType>('walk_in');
  const [referredByEmployeeId, setReferredByEmployeeId] = useState('');
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    localStorage.setItem(POS_DRAFT_KEY, JSON.stringify({ cart }));
  }, [cart]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim().toLowerCase()), 140);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const loadBaseData = async () => {
      try {
        const [storeData, customerData, employeeData] = await Promise.all([listStores(), listCustomers(), listEmployees()]);
        const activeStores = storeData.filter((store) => store.is_active);
        const assignedStore = user.assignedStoreId
          ? activeStores.find((store) => String(store.id) === String(user.assignedStoreId))
          : activeStores[0];
        setStores(activeStores);
        setCustomers(customerData);
        setEmployees(employeeData);
        setCurrentStoreId(assignedStore ? String(assignedStore.id) : '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load POS data');
      }
    };
    void loadBaseData();
  }, [user.assignedStoreId]);

  useEffect(() => {
    const refreshInventory = () => setInventoryRefreshKey((value) => value + 1);
    window.addEventListener('inventory:changed', refreshInventory);
    const interval = window.setInterval(refreshInventory, 5000);
    return () => {
      window.removeEventListener('inventory:changed', refreshInventory);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!currentStoreId) { setProducts([]); return; }
    const loadProducts = async () => {
      try {
        const productRows = await listStoreInventory(currentStoreId, { search: debouncedSearch, limit: 100, offset: 0 });
        setProducts(productRows.filter((p) => p.active !== false && p.quantity > 0 && (p.inventory_status === 'ready' || p.inventory_status === 'under_repair')).map(mapProduct));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load store products');
      }
    };
    void loadProducts();
  }, [currentStoreId, inventoryRefreshKey, debouncedSearch]);

  useEffect(() => {
    const phone = customerPhone.trim();
    if (phone.length < 5) return;
    const match = customers.find((c) => (c.phone || '').replace(/\D/g, '') === phone.replace(/\D/g, ''));
    if (match) {
      setCustomerName(match.name || '');
      // A known customer brings their own recorded type, so the cashier is not
      // silently re-filing a referral as a walk-in.
      if (match.source_type) setCustomerType(match.source_type);
    }
  }, [customerPhone, customers]);

  const currentStore = useMemo(
    () => stores.find((s) => String(s.id) === String(currentStoreId)) || null,
    [stores, currentStoreId],
  );

  const filteredProducts = useMemo(() => products.slice(0, 100), [products]);

  // ── Derived totals ──────────────────────────────────────────────────────
  const originalSubtotal  = useMemo(() => cart.reduce((sum, item) => sum + item.price, 0), [cart]);
  const adjustedSubtotal  = useMemo(() => cart.reduce((sum, item) => sum + (item.adjustedPrice ?? item.price), 0), [cart]);
  const adjustmentTotal   = useMemo(() => originalSubtotal - adjustedSubtotal, [originalSubtotal, adjustedSubtotal]);
  const exchangeTotal     = useMemo(() => exchangeDevices.reduce((sum, d) => sum + d.exchangeValue, 0), [exchangeDevices]);
  const finalAmount       = useMemo(() => Math.max(0, adjustedSubtotal - discount - exchangeTotal), [adjustedSubtotal, discount, exchangeTotal]);
  // Loss preview. Uses the shared margin rule with the bill-level discount
  // allocated across lines exactly as the backend will allocate it at sale
  // time, so what the cashier sees here is what Loss Management records.
  // Non-blocking by design — clearance and damaged stock are legitimate.
  const cartMargins = useMemo(() => calculateCartMargins(
    cart.map((item) => ({
      purchasePrice: item.purchasePrice,
      sellingPrice: item.adjustedPrice ?? item.price,
      quantity: 1,
    })),
    discount,
  ), [cart, discount]);
  const lossItemsInCart = useMemo(
    () => cart.filter((_, index) => cartMargins.lines[index]?.isLoss),
    [cart, cartMargins],
  );

  // ── Cart mutations ──────────────────────────────────────────────────────
  const addToCart = (product: PosProduct) => {
    if (product.inventoryStatus === 'under_repair') {
      setError('Under Repair items cannot be sold until they are marked Ready for Sale.');
      return;
    }
    if (cart.some((item) => item.id === product.id)) {
      setError('This job number is already in the bill.');
      return;
    }
    setCart((prev) => [...prev, product]);
    setError('');
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const removeFromCart = (productId: string) => setCart((prev) => prev.filter((item) => item.id !== productId));

  const updateCartPrice = (productId: string, price: number) => {
    setCart((prev) => prev.map((item) =>
      item.id === productId
        ? { ...item, adjustedPrice: price === item.price ? undefined : price }
        : item,
    ));
  };

  const updateAdjustmentCategory = (productId: string, cat: AdjustmentCategory) => {
    setCart((prev) => prev.map((item) => item.id === productId ? { ...item, adjustmentCategory: cat } : item));
  };

  const updateAdjustmentReason = (productId: string, reason: string) => {
    setCart((prev) => prev.map((item) => item.id === productId ? { ...item, adjustmentReason: reason } : item));
  };

  // ── Exchange device mutations ───────────────────────────────────────────
  const addExchangeDevice = () => {
    if (!newDevice.brand.trim() || !newDevice.model.trim() || newDevice.exchangeValue <= 0) {
      setError('Exchange device requires brand, model, and a value greater than zero.');
      return;
    }
    setExchangeDevices((prev) => [...prev, { ...newDevice, localId: `${Date.now()}-${Math.random()}` }]);
    setNewDevice({ brand: '', model: '', imei: '', condition: 'good', exchangeValue: 0, destinationStoreId: currentStoreId, inventoryStatus: 'ready' });
    setShowExchangeForm(false);
    setError('');
  };

  const removeExchangeDevice = (localId: string) => {
    setExchangeDevices((prev) => prev.filter((d) => d.localId !== localId));
  };

  // ── Clear bill ──────────────────────────────────────────────────────────
  const clearBill = () => {
    setCart([]);
    setExchangeDevices([]);
    setShowExchangeForm(false);
    setNewDevice({ brand: '', model: '', imei: '', condition: 'good', exchangeValue: 0, destinationStoreId: currentStoreId, inventoryStatus: 'ready' });
    setCustomerName('');
    setCustomerPhone('');
    setCustomerType('walk_in');
    setReferredByEmployeeId('');
    setDiscount(0);
    setPaymentMethod('Cash');
    setError('');
    setStatusMessage('');
    searchInputRef.current?.focus();
  };

  // ── Customer resolution ─────────────────────────────────────────────────
  const ensureCustomer = async () => {
    const phone = customerPhone.trim();
    const name  = customerName.trim();
    if (!phone && !name) return null;
    const existing = customers.find((c) => phone && (c.phone || '').replace(/\D/g, '') === phone.replace(/\D/g, ''));
    if (existing) return existing.id;
    const created = await createCustomer({
      name: name || phone,
      phone,
      email: '',
      store_ref: currentStoreId,
      source_type: customerType,
      referred_by_employee_id: customerType === 'referred' ? (referredByEmployeeId || null) : null,
    });
    setCustomers((prev) => [created, ...prev]);
    return created.id;
  };

  // ── Process bill ────────────────────────────────────────────────────────
  const processBill = async () => {
    if (cart.length === 0) { setError('Cart is empty.'); return; }
    if (!currentStoreId) { setError('Assigned store not found.'); return; }

    setIsProcessing(true);
    setError('');
    setStatusMessage('');

    try {
      const customerId = await ensureCustomer();
      const cashAmount   = paymentMethod === 'Cash' ? finalAmount : 0;
      const onlineAmount = paymentMethod === 'Cash' ? 0 : finalAmount;

      const sale = await createSale({
        customer:                customerId,
        store_ref:               currentStoreId,
        job_no:                  cart[0]?.jobNo || '',
        discount_amount:         discount.toFixed(2),
        cash_amount:             cashAmount.toFixed(2),
        online_amount:           onlineAmount.toFixed(2),
        exchange_amount:         exchangeTotal.toFixed(2),
        got_amount:              finalAmount.toFixed(2),
        salesperson_name:        user.name,
        attended_by_employee_id: null,
        customer_source:         customerType,
        referred_by_employee_id: customerType === 'referred' ? (referredByEmployeeId || null) : null,
        referral_notes:          '',
        payment_method: paymentMethod === 'UPI' ? 'upi' : paymentMethod === 'Card' ? 'card' : paymentMethod === 'Bank Transfer' ? 'bank_transfer' : 'cash',
        notes: `POS billing | payment=${paymentMethod} | type=${customerType} | customer=${customerName.trim() || 'not recorded'} | phone=${customerPhone.trim() || '-'}`,
        items: cart.map((item) => ({
          product:            item.productId,
          quantity:           1,
          unit_price:         (item.adjustedPrice ?? item.price).toFixed(2),
          adjustedUnitPrice:  item.adjustedPrice ?? item.price,
          adjustmentCategory: item.adjustedPrice !== undefined && item.adjustedPrice !== item.price
            ? (item.adjustmentCategory || 'negotiation')
            : undefined,
          adjustmentReason:   item.adjustedPrice !== undefined && item.adjustedPrice !== item.price
            ? (item.adjustmentReason || undefined)
            : undefined,
        })),
        exchange_devices: exchangeDevices.length > 0
          ? exchangeDevices.map((d) => ({
              brand:         d.brand,
              model:         d.model,
              imei:          d.imei || undefined,
              condition:     d.condition,
              exchangeValue: d.exchangeValue,
              destinationStoreId: d.destinationStoreId || currentStoreId,
              inventoryStatus: d.inventoryStatus,
            }))
          : undefined,
      });

      const refreshedProducts = await listStoreInventory(currentStoreId, { search: debouncedSearch, limit: 100, offset: 0 });
      setProducts(refreshedProducts.filter((p) => p.active !== false && p.quantity > 0 && (p.inventory_status === 'ready' || p.inventory_status === 'under_repair')).map(mapProduct));
      window.dispatchEvent(new CustomEvent('inventory:changed', { detail: { storeIds: [currentStoreId] } }));
      window.dispatchEvent(new CustomEvent('sales:changed', { detail: { storeId: currentStoreId, saleId: sale.id } }));
      setStatusMessage(`Bill processed: ${sale.sale_no || sale.id} | Rs ${toMoney(finalAmount)}`);
      clearBill();
    } catch (err) {
      // Business-rule rejections (a device already sold, stock gone) carry a
      // message the cashier can act on. Prefixing those with a status code
      // only buries the instruction, so the code is kept for genuine faults.
      const isBusinessRule = isApiError(err) && err.status >= 400 && err.status < 500;
      const message = isApiError(err)
        ? (isBusinessRule ? err.message : `${err.status} - ${err.message}`)
        : (err instanceof Error ? err.message : 'Failed to process bill');
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="pos-terminal">
      <header className="pos-topbar">
        <div>
          <h1>POS Billing</h1>
          <p>{currentStore?.name || 'Assigned Store'} — {user.name}</p>
        </div>
        <div className="pos-topbar-metrics">
          <span>{products.length} available</span>
          <strong>Rs {toMoney(finalAmount)}</strong>
        </div>
      </header>

      {(error || statusMessage) && (
        <div className={`pos-alert ${error ? 'error' : 'success'}`}>
          {error || statusMessage}
        </div>
      )}

      {cartMargins.lossLines > 0 && (
        <div className="pos-alert warning pos-loss-alert">
          <div>
            <strong>⚠ LOSS DETECTED</strong> — {cartMargins.lossLines} item{cartMargins.lossLines > 1 ? 's' : ''} in this bill {cartMargins.lossLines > 1 ? 'are' : 'is'} priced below cost,
            for a total loss of <strong>Rs {Math.round(cartMargins.totalLossAmount).toLocaleString()}</strong>.
            This will not block the sale, but it will be recorded in Loss Management.
          </div>
          <ul className="pos-loss-lines">
            {cart.map((item, index) => {
              const line = cartMargins.lines[index];
              if (!line?.isLoss) return null;
              return (
                <li key={item.id}>
                  <span>{item.name}</span>
                  <span>
                    cost Rs {Math.round(line.totalCost).toLocaleString()} &rarr; final Rs {Math.round(line.effectiveSellingPrice).toLocaleString()}
                    {line.discount > 0 ? ` (incl. Rs ${Math.round(line.discount).toLocaleString()} bill discount)` : ''}
                  </span>
                  <strong>-Rs {Math.round(line.lossAmount).toLocaleString()}</strong>
                </li>
              );
            })}
          </ul>
          {/* One below-cost item does not make the whole bill a loss. */}
          <div className="pos-loss-net">
            Transaction margin: <MarginBadge result={cartMargins.total} />{' '}
            <strong>{cartMargins.total.totalMargin < 0 ? '-' : '+'}Rs {Math.round(Math.abs(cartMargins.total.totalMargin)).toLocaleString()}</strong>
          </div>
        </div>
      )}

      <main className="pos-workspace">

        {/* ── Products panel ────────────────────────────────────────────── */}
        <section className="pos-column pos-products">
          <div className="pos-section-head">
            <h2>Products</h2>
            <span>{filteredProducts.length} results</span>
          </div>

          <div className="pos-search-box">
            <span className="material-icons">search</span>
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search job no, brand, model..."
              autoFocus
            />
            {searchQuery && <button type="button" onClick={() => setSearchQuery('')}>Clear</button>}
          </div>

          <div className="pos-product-table-wrap">
            <table className="pos-product-table">
              <thead>
                <tr>
                  <th>Job No</th>
                  <th>Product</th>
                  <th>Storage</th>
                  <th>Network</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    // Always route through addToCart — it owns the
                    // "Under Repair cannot be sold" rule and surfaces the
                    // reason, instead of the click silently doing nothing.
                    onClick={() => addToCart(product)}
                    className={product.inventoryStatus === 'under_repair' ? 'pos-product-blocked' : ''}
                    title={product.inventoryStatus === 'under_repair' ? 'Under Repair items cannot be sold' : undefined}
                  >
                    <td><strong>{product.jobNo}</strong></td>
                    <td>{product.name}</td>
                    <td>{product.storage}</td>
                    <td>{product.network}</td>
                    <td><span className={`pos-status ${product.inventoryStatus === 'under_repair' ? 'blocked' : 'ready'}`}>{product.inventoryStatus === 'under_repair' ? 'Under Repair' : 'Ready for Sale'}</span></td>
                    <td>Rs {toMoney(product.price)}</td>
                    <td><span className={product.productType === 'USED PHONE' ? 'pos-type used' : 'pos-type new'}>{product.productType}</span></td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr><td colSpan={7} className="pos-empty">No products found in this store.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Bill panel ────────────────────────────────────────────────── */}
        <section className="pos-column pos-cart">
          <div className="pos-section-head">
            <h2>Bill</h2>
            <span>{cart.length} items</span>
          </div>

          <div className="pos-cart-list">
            {cart.map((item, index) => (
              <CartItemRow
                key={item.id}
                item={item}
                margin={cartMargins.lines[index]}
                onPriceChange={updateCartPrice}
                onCategoryChange={updateAdjustmentCategory}
                onReasonChange={updateAdjustmentReason}
                onRemove={removeFromCart}
              />
            ))}
            {cart.length === 0 && <div className="pos-empty cart-empty">Click a product row to add it.</div>}
          </div>

          {/* ── Exchange devices ─────────────────────────────────────── */}
          <div className="pos-exchange-section">
            <div className="pos-exchange-header">
              <span className="pos-exchange-label">
                <span className="material-icons">swap_horiz</span>
                Add Exchange / Buyback Device
                {exchangeDevices.length > 0 && <em className="pos-exchange-badge">{exchangeDevices.length}</em>}
              </span>
              <button type="button" className="pos-exchange-add-btn" onClick={() => setShowExchangeForm((v) => !v)}>
                <span className="material-icons">{showExchangeForm ? 'expand_less' : 'add'}</span>
              </button>
            </div>

            {exchangeDevices.length > 0 && (
              <div className="pos-exchange-list">
                {exchangeDevices.map((d) => (
                  <div key={d.localId} className="pos-exchange-row">
                    <span className="pos-exchange-device-info">
                      <strong>{d.brand} {d.model}</strong>
                      {d.imei && <em>{d.imei}</em>}
                      <em className="pos-exchange-condition">{d.condition}</em>
                    </span>
                    <span className="pos-exchange-value">−Rs {toMoney(d.exchangeValue)}</span>
                    <button type="button" onClick={() => removeExchangeDevice(d.localId)} aria-label="Remove device">
                      <span className="material-icons">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showExchangeForm && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)', background: 'rgba(9, 12, 18, 0.52)', display: 'grid', placeItems: 'center', padding: 16 }}>
                <div style={{ width: 'min(860px, 100%)', borderRadius: 20, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', boxShadow: '0 30px 80px rgba(0,0,0,0.28)', overflow: 'hidden' }}>
                  <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: 18 }}>Add Exchange / Buyback Device</strong>
                      <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>This creates one linked buyback record and one inventory item.</p>
                    </div>
                    <button type="button" className="pos-exchange-add-btn" onClick={() => setShowExchangeForm(false)}>
                      <span className="material-icons">close</span>
                    </button>
                  </div>
                  <div style={{ padding: 20, display: 'grid', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                      <input className="pos-exchange-input" placeholder="Brand *" value={newDevice.brand} onChange={(e) => setNewDevice((p) => ({ ...p, brand: e.target.value }))} />
                      <input className="pos-exchange-input" placeholder="Model *" value={newDevice.model} onChange={(e) => setNewDevice((p) => ({ ...p, model: e.target.value }))} />
                      <input className="pos-exchange-input" placeholder="IMEI / Serial Number" value={newDevice.imei || ''} onChange={(e) => setNewDevice((p) => ({ ...p, imei: e.target.value }))} />
                      <input className="pos-exchange-input" placeholder="Storage / Variant" value={''} onChange={() => {}} disabled />
                      <select className="pos-exchange-input pos-exchange-select" value={newDevice.condition} onChange={(e) => setNewDevice((p) => ({ ...p, condition: e.target.value as ExchangeDeviceEntry['condition'] }))}>
                        {EXCHANGE_CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <input className="pos-exchange-input" type="number" min="0" placeholder="Exchange / Buyback Value" value={newDevice.exchangeValue || ''} onChange={(e) => setNewDevice((p) => ({ ...p, exchangeValue: Number(e.target.value || 0) }))} />
                      <select className="pos-exchange-input pos-exchange-select" value={newDevice.destinationStoreId || currentStoreId} onChange={(e) => setNewDevice((p) => ({ ...p, destinationStoreId: e.target.value }))}>
                        {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                      </select>
                      <select className="pos-exchange-input pos-exchange-select" value={newDevice.inventoryStatus} onChange={(e) => setNewDevice((p) => ({ ...p, inventoryStatus: e.target.value as ExchangeDeviceEntry['inventoryStatus'] }))}>
                        <option value="ready">Ready for Sale</option>
                        <option value="under_repair">Under Repair</option>
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'start' }}>
                      <textarea className="pos-exchange-input" rows={4} placeholder="Notes, condition details, or remarks" style={{ resize: 'vertical' }} />
                      <div style={{ minWidth: 280, padding: 14, borderRadius: 16, background: 'var(--color-primary-50)', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>New Product Price</span><strong>Rs {toMoney(originalSubtotal)}</strong></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>Exchange Device</span><strong>{newDevice.brand || 'Device'}</strong></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>Exchange Value / Adjustment</span><strong>−Rs {toMoney(newDevice.exchangeValue || 0)}</strong></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.08)' }}><span>Final Payable Amount</span><strong>Rs {toMoney(Math.max(0, adjustedSubtotal - discount - exchangeTotal - (newDevice.exchangeValue || 0) + exchangeTotal))}</strong></div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: 10, alignSelf: 'end' }}>
                        <button type="button" className="pos-exchange-confirm-btn" onClick={addExchangeDevice}><span className="material-icons">check</span> Add Device</button>
                        <button type="button" className="pos-exchange-confirm-btn" onClick={() => setShowExchangeForm(false)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Totals ───────────────────────────────────────────────── */}
          <div className="pos-cart-totals">
            <div>
              <span>List Price</span>
              <strong>Rs {toMoney(originalSubtotal)}</strong>
            </div>
            {adjustmentTotal > 0 && (
              <div className="pos-total-adjustment">
                <span>Price Adj.</span>
                <strong>−Rs {toMoney(adjustmentTotal)}</strong>
              </div>
            )}
            {exchangeTotal > 0 && (
              <div className="pos-total-exchange">
                <span>Exchange</span>
                <strong>−Rs {toMoney(exchangeTotal)}</strong>
              </div>
            )}
            {discount > 0 && (
              <div>
                <span>Discount</span>
                <strong>−Rs {toMoney(discount)}</strong>
              </div>
            )}
            <div className="final">
              <span>Total</span>
              <strong>Rs {toMoney(finalAmount)}</strong>
            </div>
          </div>
        </section>

        {/* ── Customer & Payment panel ───────────────────────────────────── */}
        <section className="pos-column pos-payment">
          <div className="pos-section-head">
            <h2>Customer & Payment</h2>
          </div>

          <label className="pos-field">
            <span>Phone Number</span>
            <input
              ref={phoneInputRef}
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder="Search / enter phone"
              type="tel"
            />
          </label>

          {/* Customer Type is asked for, not assumed. It is a separate
              attribute from the name below: a sale always has a type, and has
              a name only when the customer was actually identified. */}
          <label className="pos-field">
            <span>Customer Type</span>
            <div className="pos-customer-type">
              {([['walk_in', 'Walk-in'], ['referred', 'Referral']] as Array<[CustomerType, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={customerType === value ? 'active' : ''}
                  onClick={() => {
                    setCustomerType(value);
                    if (value === 'walk_in') setReferredByEmployeeId('');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </label>

          {customerType === 'referred' && (
            <label className="pos-field">
              <span>Referred By</span>
              <select value={referredByEmployeeId} onChange={(event) => setReferredByEmployeeId(event.target.value)}>
                <option value="">Select employee (optional)</option>
                {employees
                  .filter((employee) => !currentStoreId || String(employee.store_ref || '') === String(currentStoreId))
                  .map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </label>
          )}

          <label className="pos-field">
            <span>Customer Name</span>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Leave blank if not recorded" />
          </label>

          <label className="pos-field">
            <span>Discount</span>
            <input type="number" min="0" value={discount} onChange={(event) => setDiscount(Number(event.target.value || 0))} />
          </label>

          <div className="pos-payment-methods">
            {paymentMethods.map((method) => (
              <button
                key={method}
                type="button"
                className={paymentMethod === method ? 'active' : ''}
                onClick={() => setPaymentMethod(method)}
              >
                {method}
              </button>
            ))}
          </div>

          <div className="pos-checkout-footer">
            <button
              type="button"
              className="pos-process-btn"
              disabled={cart.length === 0 || isProcessing}
              onClick={() => void processBill()}
            >
              <span className="material-icons">{isProcessing ? 'hourglass_top' : 'point_of_sale'}</span>
              <span>{isProcessing ? 'PROCESSING SALE...' : cart.length === 0 ? 'ADD PRODUCT TO PROCEED' : 'PROCEED SALE'}</span>
              {cart.length > 0 && !isProcessing && <strong>Rs {toMoney(finalAmount)}</strong>}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default POS;
