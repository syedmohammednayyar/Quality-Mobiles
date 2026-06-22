import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PaymentMethod, User } from '../types';
import {
  createCustomer,
  createSale,
  listCustomers,
  listStoreInventory,
  listStores,
  isApiError,
  type ApiCustomer,
  type ApiStoreInventoryRow,
  type ApiStore,
} from '../services/api';
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
  productType: string;
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
    productType: product.category === 'used_phone' ? 'USED PHONE' : 'NEW',
  };
};

// ─── Cart Item Row ──────────────────────────────────────────────────────────

interface CartItemRowProps {
  item: PosCartItem;
  onPriceChange:    (id: string, price: number) => void;
  onCategoryChange: (id: string, cat: AdjustmentCategory) => void;
  onReasonChange:   (id: string, reason: string) => void;
  onRemove:         (id: string) => void;
}

const CartItemRow: React.FC<CartItemRowProps> = ({ item, onPriceChange, onCategoryChange, onReasonChange, onRemove }) => {
  const billedPrice = item.adjustedPrice ?? item.price;
  const priceChanged = billedPrice !== item.price;

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
    brand: '', model: '', imei: '', condition: 'good', exchangeValue: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
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
        const [storeData, customerData] = await Promise.all([listStores(), listCustomers()]);
        const activeStores = storeData.filter((store) => store.is_active);
        const assignedStore = user.assignedStoreId
          ? activeStores.find((store) => String(store.id) === String(user.assignedStoreId))
          : activeStores[0];
        setStores(activeStores);
        setCustomers(customerData);
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
        setProducts(productRows.filter((p) => p.active !== false && p.quantity > 0 && p.inventory_status === 'ready').map(mapProduct));
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
    if (match) setCustomerName(match.name || '');
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

  // ── Cart mutations ──────────────────────────────────────────────────────
  const addToCart = (product: PosProduct) => {
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
    setNewDevice({ brand: '', model: '', imei: '', condition: 'good', exchangeValue: 0 });
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
    setNewDevice({ brand: '', model: '', imei: '', condition: 'good', exchangeValue: 0 });
    setCustomerName('');
    setCustomerPhone('');
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
    const created = await createCustomer({ name: name || phone, phone, email: '', store_ref: currentStoreId });
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
        customer_source:         'walk_in',
        referred_by_employee_id: null,
        referral_notes:          '',
        payment_method: paymentMethod === 'UPI' ? 'upi' : paymentMethod === 'Card' ? 'card' : paymentMethod === 'Bank Transfer' ? 'bank_transfer' : 'cash',
        notes: `POS billing | payment=${paymentMethod} | customer=${customerName.trim() || 'walk-in'} | phone=${customerPhone.trim() || '-'}`,
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
            }))
          : undefined,
      });

      const refreshedProducts = await listStoreInventory(currentStoreId, { search: debouncedSearch, limit: 100, offset: 0 });
      setProducts(refreshedProducts.filter((p) => p.active !== false && p.quantity > 0 && p.inventory_status === 'ready').map(mapProduct));
      window.dispatchEvent(new CustomEvent('inventory:changed', { detail: { storeIds: [currentStoreId] } }));
      window.dispatchEvent(new CustomEvent('sales:changed', { detail: { storeId: currentStoreId, saleId: sale.id } }));
      setStatusMessage(`Bill processed: ${sale.sale_no || sale.id} | Rs ${toMoney(finalAmount)}`);
      clearBill();
    } catch (err) {
      const message = isApiError(err) ? `${err.status} - ${err.message}` : (err instanceof Error ? err.message : 'Failed to process bill');
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
                  <th>Price</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} onClick={() => addToCart(product)}>
                    <td><strong>{product.jobNo}</strong></td>
                    <td>{product.name}</td>
                    <td>{product.storage}</td>
                    <td>{product.network}</td>
                    <td>Rs {toMoney(product.price)}</td>
                    <td><span className={product.productType === 'USED PHONE' ? 'pos-type used' : 'pos-type new'}>{product.productType}</span></td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr><td colSpan={6} className="pos-empty">No products found in this store.</td></tr>
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
            {cart.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
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
                Exchange Devices
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
              <div className="pos-exchange-form">
                <div className="pos-exchange-form-row">
                  <input
                    className="pos-exchange-input"
                    placeholder="Brand *"
                    value={newDevice.brand}
                    onChange={(e) => setNewDevice((p) => ({ ...p, brand: e.target.value }))}
                  />
                  <input
                    className="pos-exchange-input"
                    placeholder="Model *"
                    value={newDevice.model}
                    onChange={(e) => setNewDevice((p) => ({ ...p, model: e.target.value }))}
                  />
                </div>
                <div className="pos-exchange-form-row">
                  <input
                    className="pos-exchange-input"
                    placeholder="IMEI (optional)"
                    value={newDevice.imei || ''}
                    onChange={(e) => setNewDevice((p) => ({ ...p, imei: e.target.value }))}
                  />
                  <select
                    className="pos-exchange-input pos-exchange-select"
                    value={newDevice.condition}
                    onChange={(e) => setNewDevice((p) => ({ ...p, condition: e.target.value as ExchangeDeviceEntry['condition'] }))}
                  >
                    {EXCHANGE_CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="pos-exchange-form-row">
                  <input
                    className="pos-exchange-input"
                    type="number"
                    min="0"
                    placeholder="Exchange Value (Rs) *"
                    value={newDevice.exchangeValue || ''}
                    onChange={(e) => setNewDevice((p) => ({ ...p, exchangeValue: Number(e.target.value || 0) }))}
                  />
                  <button type="button" className="pos-exchange-confirm-btn" onClick={addExchangeDevice}>
                    <span className="material-icons">check</span> Add Device
                  </button>
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

          <label className="pos-field">
            <span>Customer Name</span>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in customer" />
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
