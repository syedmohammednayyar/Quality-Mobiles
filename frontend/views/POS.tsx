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

type PosCartItem = PosProduct;

const paymentMethods: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];
const POS_DRAFT_KEY = 'quality-mobiles-pos-draft';

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
    if (!currentStoreId) {
      setProducts([]);
      return;
    }

    const loadProducts = async () => {
      try {
        const productRows = await listStoreInventory(currentStoreId, { search: debouncedSearch, limit: 100, offset: 0 });
        setProducts(productRows.filter((product) => product.active !== false && product.quantity > 0 && product.inventory_status === 'ready').map(mapProduct));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load store products');
      }
    };

    void loadProducts();
  }, [currentStoreId, inventoryRefreshKey, debouncedSearch]);

  useEffect(() => {
    const phone = customerPhone.trim();
    if (phone.length < 5) return;
    const match = customers.find((customer) => (customer.phone || '').replace(/\D/g, '') === phone.replace(/\D/g, ''));
    if (match) setCustomerName(match.name || '');
  }, [customerPhone, customers]);

  const currentStore = useMemo(
    () => stores.find((store) => String(store.id) === String(currentStoreId)) || null,
    [stores, currentStoreId],
  );

  const filteredProducts = useMemo(() => {
    return products.slice(0, 100);
  }, [products]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price, 0), [cart]);
  const finalAmount = Math.max(0, subtotal - discount);

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

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const clearBill = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDiscount(0);
    setPaymentMethod('Cash');
    setError('');
    setStatusMessage('');
    searchInputRef.current?.focus();
  };

  const ensureCustomer = async () => {
    const phone = customerPhone.trim();
    const name = customerName.trim();
    if (!phone && !name) return null;

    const existing = customers.find((customer) => {
      const existingPhone = (customer.phone || '').replace(/\D/g, '');
      return phone && existingPhone === phone.replace(/\D/g, '');
    });
    if (existing) return existing.id;

    const created = await createCustomer({
      name: name || phone,
      phone,
      email: '',
      store_ref: currentStoreId,
    });
    setCustomers((prev) => [created, ...prev]);
    return created.id;
  };

  const processBill = async () => {
    if (cart.length === 0) {
      setError('Cart is empty.');
      return;
    }
    if (!currentStoreId) {
      setError('Assigned store not found.');
      return;
    }

    setIsProcessing(true);
    setError('');
    setStatusMessage('');

    try {
      const customerId = await ensureCustomer();
      const cashAmount = paymentMethod === 'Cash' ? finalAmount : 0;
      const onlineAmount = paymentMethod === 'Cash' ? 0 : finalAmount;
      const sale = await createSale({
        customer: customerId,
        store_ref: currentStoreId,
        job_no: cart[0]?.jobNo || '',
        discount_amount: discount.toFixed(2),
        cash_amount: cashAmount.toFixed(2),
        online_amount: onlineAmount.toFixed(2),
        exchange_amount: '0.00',
        got_amount: finalAmount.toFixed(2),
        salesperson_name: user.name,
        attended_by_employee_id: null,
        customer_source: 'walk_in',
        referred_by_employee_id: null,
        referral_notes: '',
        payment_method: paymentMethod === 'UPI' ? 'upi' : paymentMethod === 'Card' ? 'card' : paymentMethod === 'Bank Transfer' ? 'bank_transfer' : 'cash',
        notes: `POS billing | payment=${paymentMethod} | customer=${customerName.trim() || 'walk-in'} | phone=${customerPhone.trim() || '-'}`,
        items: cart.map((item) => ({
          product: item.productId,
          quantity: 1,
          unit_price: item.price.toFixed(2),
        })),
      });

      const refreshedProducts = await listStoreInventory(currentStoreId, { search: debouncedSearch, limit: 100, offset: 0 });
      setProducts(refreshedProducts.filter((product) => product.active !== false && product.quantity > 0 && product.inventory_status === 'ready').map(mapProduct));
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
          <p>{currentStore?.name || 'Assigned Store'} - {user.name}</p>
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

        <section className="pos-column pos-cart">
          <div className="pos-section-head">
            <h2>Bill</h2>
            <span>{cart.length} items</span>
          </div>

          <div className="pos-cart-list">
            {cart.map((item) => (
              <div className="pos-cart-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.jobNo} | {item.storage} | {item.network}</span>
                </div>
                <b>Rs {toMoney(item.price)}</b>
                <button type="button" onClick={() => removeFromCart(item.id)} aria-label="Remove item">
                  <span className="material-icons">close</span>
                </button>
              </div>
            ))}
            {cart.length === 0 && <div className="pos-empty cart-empty">Click a product row to add it.</div>}
          </div>

          <div className="pos-cart-totals">
            <div><span>Items Count</span><strong>{cart.length}</strong></div>
            <div><span>Subtotal</span><strong>Rs {toMoney(subtotal)}</strong></div>
            <div><span>Discount</span><strong>Rs {toMoney(discount)}</strong></div>
            <div className="final"><span>Total</span><strong>Rs {toMoney(finalAmount)}</strong></div>
          </div>

        </section>

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
