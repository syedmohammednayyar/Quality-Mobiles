import React, { useEffect, useMemo, useState } from 'react';
import { PaymentMethod, User } from '../types';
import {
  createSale,
  listProducts,
  listStores,
  isApiError,
  type ApiProduct,
  type ApiStore,
} from '../services/api';
import './POS.css';

type PosProduct = {
  id: string;
  productId: string;
  name: string;
  brand: string;
  model: string;
  retailPrice: number;
  stockQuantity: number;
  category: 'New Phones' | 'Used Phones' | 'Accessories' | 'Services';
  avatarIcon: string;
  avatarColor: string;
};

type PosCartItem = PosProduct & {
  cartQuantity: number;
  itemDiscount: number;
};

const categories = [
  { id: 'new-phones', label: 'New Phones' },
  { id: 'used-phones', label: 'Used Phones' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'services', label: 'Services' },
];

const categorizeProduct = (product: ApiProduct): PosProduct['category'] => {
  const category = (product as ApiProduct & { category?: string }).category;
  if (category === 'used_phone') return 'Used Phones';
  if (category === 'accessories') return 'Accessories';
  if (category === 'services') return 'Services';
  return 'New Phones';
};

const getCategoryIcon = (category: PosProduct['category']): string => {
  if (category === 'Used Phones') return 'smartphone';
  if (category === 'Accessories') return 'headphones';
  if (category === 'Services') return 'build_circle';
  return 'phone_iphone';
};

const avatarColors = ['pos-avatar-teal', 'pos-avatar-blue', 'pos-avatar-orange', 'pos-avatar-pink'];
const pickAvatarColor = (text: string): string => {
  const key = text || 'default';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash + key.charCodeAt(i)) % avatarColors.length;
  }
  return avatarColors[hash];
};

const mapProduct = (product: ApiProduct): PosProduct => {
  const category = categorizeProduct(product);
  return {
    id: String(product.id),
    productId: product.id,
    name: product.name,
    brand: product.name.split(' ')[0] || 'Generic',
    model: product.job_id || product.imei || product.sku || 'N/A',
    retailPrice: Number(product.price),
    stockQuantity: product.stock_quantity,
    category,
    avatarIcon: getCategoryIcon(category),
    avatarColor: pickAvatarColor(`${product.sku}-${product.name}`),
  };
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-secondary)',
};

interface POSProps {
  user: User;
}

const POS: React.FC<POSProps> = ({ user }) => {
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('new-phones');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [currentStoreId, setCurrentStoreId] = useState('');
  const [exchangeCredit, setExchangeCredit] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [jobNo, setJobNo] = useState('');
  const [icNumber, setIcNumber] = useState('');
  const [salespersonName, setSalespersonName] = useState('');
  const [exchangeModel, setExchangeModel] = useState('');
  const [gift, setGift] = useState('');
  const [cashAmount, setCashAmount] = useState('0.00');
  const [onlineAmount, setOnlineAmount] = useState('0.00');
  const [gotAmount, setGotAmount] = useState('0.00');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const storeData = await listStores();
        const activeStores = storeData
          .filter((store) => store.is_active)
          .filter((store) => user.role === 'Admin' || !user.assignedStoreId || store.id === user.assignedStoreId);
        setStores(activeStores);
        if (activeStores.length > 0) {
          setCurrentStoreId(String(activeStores[0].id));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load POS data');
      }
    };

    void load();
  }, []);

  useEffect(() => {
    if (!currentStoreId) {
      setProducts([]);
      return;
    }

    const loadStoreProducts = async () => {
      try {
        const productData = await listProducts(currentStoreId);
        setProducts(productData.filter((product) => product.active).map(mapProduct));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load store inventory');
      }
    };

    void loadStoreProducts();
  }, [currentStoreId]);

  const currentStore = useMemo(
    () => stores.find((store) => String(store.id) === currentStoreId) || null,
    [stores, currentStoreId]
  );

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + (item.retailPrice * item.cartQuantity) - item.itemDiscount, 0),
    [cart]
  );
  const tax = useMemo(() => 0, []);
  const total = useMemo(() => Math.max(0, subtotal + tax - discount - exchangeCredit), [subtotal, tax, discount, exchangeCredit]);

  useEffect(() => {
    const normalized = total.toFixed(2);
    if (paymentMethod === 'Cash') {
      setCashAmount(normalized);
      setOnlineAmount('0.00');
      setGotAmount(normalized);
      return;
    }
    setCashAmount('0.00');
    setOnlineAmount(normalized);
    setGotAmount(normalized);
  }, [paymentMethod, total]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCategory = selectedCategory === 'all'
        || (selectedCategory === 'new-phones' && p.category === 'New Phones')
        || (selectedCategory === 'used-phones' && p.category === 'Used Phones')
        || (selectedCategory === 'accessories' && p.category === 'Accessories')
        || (selectedCategory === 'services' && p.category === 'Services');

      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase())
        || p.model.toLowerCase().includes(searchQuery.toLowerCase());

      return matchCategory && matchSearch;
    });
  }, [products, searchQuery, selectedCategory]);

  const suggestedProducts = useMemo(() => {
    const list = filteredProducts.slice();
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list.sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) || a.model.toLowerCase().startsWith(q) ? 1 : 0;
        const bStarts = b.name.toLowerCase().startsWith(q) || b.model.toLowerCase().startsWith(q) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;
        return b.stockQuantity - a.stockQuantity;
      });
      return list.slice(0, 6);
    }
    list.sort((a, b) => b.stockQuantity - a.stockQuantity);
    return list.slice(0, 6);
  }, [filteredProducts, searchQuery]);

  const addToCart = (product: PosProduct) => {
    if (product.category !== 'Services' && product.stockQuantity < 1) {
      setError(`No stock available for ${product.name}.`);
      return;
    }

    const existingItem = cart.find((item) => item.id === product.id);
    if (existingItem) {
      if (product.category !== 'Services' && existingItem.cartQuantity >= product.stockQuantity) {
        setError(`Only ${product.stockQuantity} unit(s) available for ${product.name}.`);
        return;
      }
      setCart((prev) => prev.map((item) => (
        item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item
      )));
      setError('');
      return;
    }

    setCart((prev) => [...prev, { ...product, cartQuantity: 1, itemDiscount: 0 }]);
    setError('');
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const currentItem = cart.find((item) => item.id === productId);
    if (!currentItem) return;
    if (currentItem.category !== 'Services' && quantity > currentItem.stockQuantity) {
      setError(`Only ${currentItem.stockQuantity} unit(s) available for ${currentItem.name}.`);
      return;
    }

    setCart((prev) => prev.map((item) => (
      item.id === productId ? { ...item, cartQuantity: quantity } : item
    )));
    setError('');
  };

  const handleProcessSale = async () => {
    if (cart.length === 0) {
      setError('Cart is empty.');
      return;
    }
    if (!currentStore) {
      setError('Select a store before processing the sale.');
      return;
    }

    setIsProcessing(true);
    setError('');
    setStatusMessage('');

    try {
      const cashValue = Number(cashAmount || 0);
      const onlineValue = Number(onlineAmount || 0);
      const exchangeValue = Number(exchangeCredit || 0);
      const gotValue = Number(gotAmount || 0);
      const paymentTotal = cashValue + onlineValue;

      if (Math.abs(paymentTotal - total) > 0.01) {
        throw new Error(`Payment split must match the grand total of Rs ${total.toFixed(2)}.`);
      }

      const createdSale = await createSale({
        customer: null,
        store_ref: currentStore.id,
        job_no: jobNo.trim(),
        ic_number: icNumber.trim(),
        discount_amount: discount.toFixed(2),
        cash_amount: cashValue.toFixed(2),
        online_amount: onlineValue.toFixed(2),
        exchange_amount: exchangeValue.toFixed(2),
        exchange_model: exchangeModel.trim(),
        got_amount: gotValue.toFixed(2),
        gift: gift.trim(),
        salesperson_name: salespersonName.trim(),
        notes: `POS checkout | payment=${paymentMethod} | discount=${discount.toFixed(2)} | customer=${customerName.trim() || 'walk-in'} | phone=${customerPhone.trim() || '-'}`,
        items: cart.map((item) => ({
          product: item.productId,
          quantity: item.cartQuantity,
          unit_price: item.retailPrice.toFixed(2),
        })),
      });

        const refreshedProducts = await listProducts(currentStore.id);
      setProducts(refreshedProducts.filter((product) => product.active).map(mapProduct));

      setStatusMessage(`Sale ${createdSale.job_no || `#${createdSale.id}`} processed: Rs ${Number(createdSale.total_amount).toLocaleString()} (${createdSale.payment_status || 'paid'}).`);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setDiscount(0);
      setExchangeCredit(0);
      setJobNo('');
      setIcNumber('');
      setSalespersonName('');
      setExchangeModel('');
      setGift('');
      setCashAmount('0.00');
      setOnlineAmount('0.00');
      setGotAmount('0.00');
    } catch (err) {
      const message = isApiError(err)
        ? `${err.status} - ${err.message}`
        : (err instanceof Error ? err.message : 'Failed to process sale');
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="pos-container">
      <div className="pos-header">
        <div className="store-info">
          <h2 className="pos-title">POS Terminal</h2>
          <p className="store-name">{currentStore?.name || 'Select Store'} - Terminal 01</p>
        </div>
        <select value={currentStoreId} onChange={(e) => setCurrentStoreId(e.target.value)} className="input-field" style={{ maxWidth: 180, marginBottom: 0 }}>
          <option value="">Select Store</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>{store.name}</option>
          ))}
        </select>
        <div className="pos-time">{new Date().toLocaleTimeString()}</div>
      </div>

      {error && <p style={{ color: '#dc2626', marginBottom: 12 }}>{error}</p>}
      {!error && statusMessage && <p style={{ color: 'var(--color-success-600)', marginBottom: 12, fontWeight: 600 }}>{statusMessage}</p>}

      <div className="pos-layout">
        <div className="pos-panel product-panel">
          <div className="panel-header">
            <h3>Product Catalog</h3>
          </div>

          <div className="search-section">
            <div className="search-input-wrap">
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-field"
                autoFocus
              />
            </div>
          </div>

          <div className="category-tabs">
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`category-tab ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="suggestion-strip">
            <p className="suggestion-title">{searchQuery.trim() ? 'Suggested Matches' : 'Suggested Products'}</p>
            <div className="suggestion-list">
              {suggestedProducts.map((product) => (
                <button key={`suggest-${product.id}`} className="suggestion-chip" onClick={() => addToCart(product)}>
                  <span className={`material-icons suggestion-icon ${product.avatarColor}`}>{product.avatarIcon}</span>
                  <span>{product.name}</span>
                </button>
              ))}
              {suggestedProducts.length === 0 && <span className="suggestion-empty">No suggestions</span>}
            </div>
          </div>

          <div className="products-grid">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  className="product-card"
                  onClick={() => addToCart(product)}
                >
                  <div className={`product-image-avatar ${product.avatarColor}`}>
                    <span className="material-icons">{product.avatarIcon}</span>
                  </div>
                  <div className="product-info">
                    <h4 className="product-name">{product.name}</h4>
                    <p className="product-model">{product.model}</p>
                    <p className="product-model">Stock: {product.stockQuantity}</p>
                    <p className="product-price">Rs {product.retailPrice.toLocaleString()}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="no-products">No products found</div>
            )}
          </div>
        </div>

        <div className="pos-panel cart-panel">
          <div className="panel-header">
            <h3>Cart</h3>
            <span className="item-count">{cart.length} items</span>
          </div>

          <div className="customer-section">
            <div className="customer-header">
              <h4>Customer</h4>
            </div>
            <label style={labelStyle}>Customer Name</label>
            <input
              type="text"
              placeholder="Customer Name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="input-field"
            />
            <label style={labelStyle}>Phone Number</label>
            <input
              type="tel"
              placeholder="Phone Number"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="input-field"
            />
            <div className="pos-inline-grid">
              <div>
                <label style={labelStyle}>Job Number</label>
                <input type="text" placeholder="Job Number" value={jobNo} onChange={(e) => setJobNo(e.target.value)} className="input-field" />
              </div>
              <div>
                <label style={labelStyle}>IC Number</label>
                <input type="text" placeholder="IC Number" value={icNumber} onChange={(e) => setIcNumber(e.target.value)} className="input-field" />
              </div>
              <div>
                <label style={labelStyle}>Salesman Name</label>
                <input type="text" placeholder="Salesman Name" value={salespersonName} onChange={(e) => setSalespersonName(e.target.value)} className="input-field" />
              </div>
              <div>
                <label style={labelStyle}>Gift</label>
                <input type="text" placeholder="Gift" value={gift} onChange={(e) => setGift(e.target.value)} className="input-field" />
              </div>
            </div>
          </div>

          <div className="cart-items">
            {cart.length > 0 ? (
              cart.map((item) => (
                <div key={item.id} className="cart-item">
                  <div className="item-details">
                    <h4 className="item-name">{item.name}</h4>
                    <p className="item-code">{item.model}</p>
                  </div>
                  <div className="item-quantity">
                    <button onClick={() => updateQuantity(item.id, item.cartQuantity - 1)}>-</button>
                    <input
                      type="number"
                      value={item.cartQuantity}
                      onChange={(e) => updateQuantity(item.id, parseInt(e.target.value, 10) || 0)}
                      className="qty-input"
                    />
                    <button onClick={() => updateQuantity(item.id, item.cartQuantity + 1)}>+</button>
                  </div>
                  <div className="item-price">Rs {(item.retailPrice * item.cartQuantity).toLocaleString()}</div>
                  <button className="remove-btn" onClick={() => removeFromCart(item.id)}>x</button>
                </div>
              ))
            ) : (
              <div className="empty-cart">Cart is empty</div>
            )}
          </div>
        </div>

        <div className="pos-panel payment-panel">
          <div className="panel-header">
            <h3>Checkout</h3>
          </div>

          <div className="bill-summary">
            <div className="summary-row">
              <span>Subtotal</span>
              <span className="amount">Rs {subtotal.toLocaleString()}</span>
            </div>
            <div className="summary-row">
              <span>Tax (server)</span>
              <span className="amount">Rs {tax.toLocaleString()}</span>
            </div>
            <div className="summary-row">
              <span>Discount</span>
              <div className="discount-input">
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  className="input-field"
                />
              </div>
            </div>
            <div className="summary-row">
              <span>Exchange Credit</span>
              <div className="exchange-input">
                <input
                  type="number"
                  value={exchangeCredit}
                  onChange={(e) => setExchangeCredit(parseFloat(e.target.value) || 0)}
                  className="input-field"
                />
              </div>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-row grand-total">
              <span>Grand Total</span>
              <span className="amount">Rs {total.toLocaleString()}</span>
            </div>
          </div>

          <div className="payment-method">
            <h4>Payment Method</h4>
            <div className="method-buttons">
              {(['Cash', 'Card', 'UPI', 'Bank Transfer'] as PaymentMethod[]).map((method) => (
                <button
                  key={method}
                  className={`method-btn ${paymentMethod === method ? 'active' : ''}`}
                  onClick={() => setPaymentMethod(method)}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div className="payment-method">
            <h4>Sale Details</h4>
            <div className="pos-inline-grid">
              <div>
                <label style={labelStyle}>Cash Amount</label>
                <input type="number" min="0" step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="input-field" />
              </div>
              <div>
                <label style={labelStyle}>Online Amount</label>
                <input type="number" min="0" step="0.01" value={onlineAmount} onChange={(e) => setOnlineAmount(e.target.value)} className="input-field" />
              </div>
              <div>
                <label style={labelStyle}>Exchange Amount</label>
                <input type="number" min="0" step="0.01" value={exchangeCredit} onChange={(e) => setExchangeCredit(parseFloat(e.target.value) || 0)} className="input-field" />
              </div>
              <div>
                <label style={labelStyle}>Exchange Model</label>
                <input type="text" value={exchangeModel} onChange={(e) => setExchangeModel(e.target.value)} className="input-field" placeholder="Exchange Model" />
              </div>
              <div>
                <label style={labelStyle}>Received Amount</label>
                <input type="number" min="0" step="0.01" value={gotAmount} onChange={(e) => setGotAmount(e.target.value)} className="input-field" />
              </div>
            </div>
          </div>

          <div className="action-buttons">
            <button className="btn btn-secondary" onClick={() => setCart([])}>Cancel</button>
            <button
              className="btn btn-primary process-btn"
              onClick={handleProcessSale}
              disabled={cart.length === 0 || isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Process Sale'}
            </button>
          </div>

          <div className="quick-stats">
            <div className="stat">
              <span className="stat-label">Items</span>
              <span className="stat-value">{cart.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Total</span>
              <span className="stat-value">Rs {total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POS;
