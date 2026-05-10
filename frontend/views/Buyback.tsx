import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, isPrivilegedUser } from '../types';
import {
  createBuyback,
  deleteBuyback,
  listBuybacks,
  listCustomers,
  listStores,
  updateBuyback,
  type ApiBuyback,
  type ApiCustomer,
  type ApiStore,
} from '../services/api';
import './Buyback.css';

const Buyback: React.FC<{ user: User }> = ({ user }) => {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();
  const storeFilter = searchParams.get('store') || 'All Stores';
  const [imei, setImei] = useState('');
  const [condition, setCondition] = useState<'Excellent' | 'Good' | 'Fair' | 'Poor'>('Good');
  const [marketValue, setMarketValue] = useState("");
  const [negotiatedPrice, setNegotiatedPrice] = useState("");
  const [deviceInfo, setDeviceInfo] = useState({ brand: '', model: '', color: '' });
  const [customer, setCustomer] = useState('');
  const [storeRef, setStoreRef] = useState('');
  const [jobNo, setJobNo] = useState('');
  const [icNumber, setIcNumber] = useState('');
  const [cashAmount, setCashAmount] = useState("");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [exchangeAmount, setExchangeAmount] = useState("");
  const [exchangeModel, setExchangeModel] = useState('');
  const [buybackList, setBuybackList] = useState<ApiBuyback[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [editingBuybackId, setEditingBuybackId] = useState<string | null>(null);
  const [pendingDeleteBuybackId, setPendingDeleteBuybackId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    status: 'Pending' as ApiBuyback['status'],
    negotiated_price: '0',
    cash_amount: '0',
  });

  useEffect(() => {
    const load = async () => {
      try {
        setError('');
        const [buybackData, customerData, storeData] = await Promise.all([
          listBuybacks(),
          listCustomers(),
          listStores(),
        ]);
        setBuybackList(buybackData);
        setCustomers(customerData);
        setStores(storeData.filter((store) => store.is_active));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load buybacks');
      }
    };

    void load();
  }, []);

  const customerById = useMemo(() => {
    const map = new Map<string, ApiCustomer>();
    customers.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [customers]);

  const storeById = useMemo(() => {
    const map = new Map<string, ApiStore>();
    stores.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [stores]);

  const filteredBuybacks = useMemo(() => {
    return buybackList.filter((item) => {
      const textMatch = !q
        || item.imei.includes(q)
        || item.brand.toLowerCase().includes(q)
        || item.model.toLowerCase().includes(q)
        || (customerById.get(item.customer || '')?.name || '').toLowerCase().includes(q);
      const storeName = storeById.get(item.store_ref || '')?.name || '';
      const storeMatch = storeFilter === 'All Stores' || storeName === storeFilter;
      return textMatch && storeMatch;
    });
  }, [buybackList, q, storeFilter, customerById, storeById]);

  const resetForm = () => {
    setImei('');
    setCondition('Good');
    setMarketValue(0);
    setNegotiatedPrice(0);
    setDeviceInfo({ brand: '', model: '', color: '' });
    setCustomer('');
    setStoreRef('');
    setJobNo('');
    setIcNumber('');
    setCashAmount(0);
    setOnlineAmount(0);
    setExchangeAmount(0);
    setExchangeModel('');
  };

  const handleSubmit = async () => {
    setStatusMessage('');
    if (!/^\d{15}$/.test(imei)) {
      setError('IMEI must be exactly 15 digits');
      return;
    }
    if (marketValue <= 0 || negotiatedPrice <= 0) {
      setError('Market value and offer price must be greater than 0');
      return;
    }
    if (!storeRef) {
      setError('Select a store');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const created = await createBuyback({
        imei,
        brand: deviceInfo.brand.trim(),
        model: deviceInfo.model.trim(),
        color: deviceInfo.color.trim(),
        customer: customer ? customer : null,
        store_ref: storeRef,
        job_no: jobNo.trim(),
        ic_number: icNumber.trim(),
        cash_amount: cashAmount.toFixed(2),
        online_amount: onlineAmount.toFixed(2),
        exchange_amount: exchangeAmount.toFixed(2),
        exchange_model: exchangeModel.trim(),
        condition,
        market_value: marketValue.toFixed(2),
        negotiated_price: negotiatedPrice.toFixed(2),
        status: 'Pending',
      });
      setBuybackList((prev) => [created, ...prev]);
      resetForm();
      setStatusMessage('Buyback added successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit buyback';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (item: ApiBuyback) => {
    setStatusMessage('');
    setError('');
    setEditingBuybackId(item.id);
    setEditForm({
      status: item.status,
      negotiated_price: String(item.negotiated_price),
      cash_amount: String(item.cash_amount || 0),
    });
  };

  const handleEdit = async (item: ApiBuyback) => {
    setStatusMessage('');

    try {
      const updated = await updateBuyback(item.id, {
        negotiated_price: Number(editForm.negotiated_price || item.negotiated_price).toFixed(2),
        cash_amount: Number(editForm.cash_amount || item.cash_amount || 0).toFixed(2),
        status: editForm.status,
      });
      setBuybackList((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setEditingBuybackId(null);
      setStatusMessage('Buyback updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update buyback');
    }
  };

  const handleDelete = async (item: ApiBuyback) => {
    setStatusMessage('');
    try {
      await deleteBuyback(item.id);
      setBuybackList((prev) => prev.filter((entry) => entry.id !== item.id));
      setPendingDeleteBuybackId(null);
      setStatusMessage('Buyback deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete buyback');
    }
  };

  return (
    <div className="buyback-container buyback-page">
      <div className="card buyback-hero">
        <div>
          <h1>Buyback Module</h1>
          <p>Capture trade-ins, evaluate offers, and monitor approval status by store.</p>
        </div>
      </div>

      {error && <p className="buyback-state buyback-state-error">{error}</p>}
      {!error && statusMessage && <p className="buyback-state">{statusMessage}</p>}

      <div className="buyback-grid">
        {!isPrivilegedUser(user) && (
          <div className="entry-card buyback-form">
            <h2>New Buyback Request</h2>

            <div className="form-group">
              <label>Store</label>
              <select value={storeRef} onChange={(e) => setStoreRef(e.target.value)} className="form-input">
                <option value="">Select Store</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Customer</label>
              <select value={customer} onChange={(e) => setCustomer(e.target.value)} className="form-input">
                <option value="">Walk-in / Unknown</option>
                {customers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Job No</label>
              <input type="text" value={jobNo} onChange={(e) => setJobNo(e.target.value)} className="form-input" />
            </div>

            <div className="form-group">
              <label>IC</label>
              <input type="text" value={icNumber} onChange={(e) => setIce.target.value} className="form-input" />
            </div>

            <div className="form-group">
              <label>Brand</label>
              <input type="text" placeholder="Apple, Samsung..." value={deviceInfo.brand} onChange={(e) => setDeviceInfo((prev) => ({ ...prev, brand: e.target.value }))} className="form-input" />
            </div>

            <div className="form-group">
              <label>Model</label>
              <input type="text" placeholder="iPhone 13, S23..." value={deviceInfo.model} onChange={(e) => setDeviceInfo((prev) => ({ ...prev, model: e.target.value }))} className="form-input" />
            </div>

            <div className="form-group">
              <label>Color</label>
              <input type="text" placeholder="Black, Blue..." value={deviceInfo.color} onChange={(e) => setDeviceInfo((prev) => ({ ...prev, color: e.target.value }))} className="form-input" />
            </div>

            <div className="form-group">
              <label>IMEI Number</label>
              <input type="text" placeholder="Enter IMEI (15 digits)" value={imei} onChange={(e) => setImei(e.target.value.replace(/\D/g, ''))} maxLength={15} className="form-input" />
            </div>

            <div className="form-group">
              <label>Device Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value as 'Excellent' | 'Good' | 'Fair' | 'Poor')} className="form-input">
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Market Value</label>
                <input type="number" value={marketValue} onChange={(e) => setMarketValue(parseInt(e.target.value, 10) || 0)} className="form-input" placeholder="Rs 0" min={0} />
              </div>
              <div className="form-group">
                <label>Offer Price</label>
                <input type="number" value={negotiatedPrice} onChange={(e) => setNegotiatedPrice(parseInt(e.target.value, 10) || 0)} className="form-input" placeholder="Rs 0" min={0} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Cash</label>
                <input type="number" value={cashAmount} onChange={(e) => setCashAmount(parseInt(e.target.value, 10) || 0)} className="form-input" placeholder="Rs 0" min={0} />
              </div>
              <div className="form-group">
                <label>Online</label>
                <input type="number" value={onlineAmount} onChange={(e) => setOnlineAmount(parseInt(e.target.value, 10) || 0)} className="form-input" placeholder="Rs 0" min={0} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Ex Amount</label>
                <input type="number" value={exchangeAmount} onChange={(e) => setExchangeAmount(parseInt(e.target.value, 10) || 0)} className="form-input" placeholder="Rs 0" min={0} />
              </div>
              <div className="form-group">
                <label>Ex Model</label>
                <input type="text" value={exchangeModel} onChange={(e) => setExchangeModel(e.target.value)} className="form-input" placeholder="Old device model" />
              </div>
            </div>

            <button className="btn btn-primary buyback-submit" onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Buyback'}
            </button>
          </div>
        )}

        <div className="list-card buyback-list-card">
          <h2>{isPrivilegedUser(user) ? 'Buyback Reports View' : 'Recent Buybacks'}</h2>
          {!isPrivilegedUser(user) && editingBuybackId !== null && (
            <div className="card" style={{ marginBottom: 12, padding: 12 }}>
              <h4 style={{ marginTop: 0 }}>Edit Buyback</h4>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                <div>
                  <label>Status</label>
                  <select className="form-input" value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as ApiBuyback['status'] }))}>
                    <option value="Pending">Pending</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Processed">Processed</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
                <div>
                  <label>Negotiated Price</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={editForm.negotiated_price} onChange={(e) => setEditForm((prev) => ({ ...prev, negotiated_price: e.target.value }))} />
                </div>
                <div>
                  <label>Cash Amount</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={editForm.cash_amount} onChange={(e) => setEditForm((prev) => ({ ...prev, cash_amount: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const current = buybackList.find((entry) => entry.id === editingBuybackId);
                    if (current) {
                      void handleEdit(current);
                    }
                  }}
                >
                  Save Changes
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingBuybackId(null)}>Cancel</button>
              </div>
            </div>
          )}
          <table className="buyback-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Customer</th>
                <th>Device</th>
                <th>IMEI</th>
                <th>Condition</th>
                <th>Offer Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBuybacks.map((item) => (
                <tr key={item.id}>
                  <td>{storeById.get(item.store_ref || '')?.name || '-'}</td>
                  <td>{customerById.get(item.customer || '')?.name || 'Walk-in'}</td>
                  <td className="device-name">{`${item.brand || 'Unknown'} ${item.model || ''}`.trim()}</td>
                  <td className="imei">{item.imei}</td>
                  <td><span className={`condition-badge condition-${item.condition.toLowerCase()}`}>{item.condition}</span></td>
                  <td className="price highlight">Rs {Number(item.negotiated_price).toLocaleString()}</td>
                  <td><span className={`status-badge status-${item.status.toLowerCase()}`}>{item.status}</span></td>
                  <td>
                    {!isPrivilegedUser(user) ? (
                      <div className="buyback-actions">
                        {pendingDeleteBuybackId === item.id ? (
                          <>
                            <button className="btn btn-danger btn-sm" onClick={() => void handleDelete(item)}>Confirm</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setPendingDeleteBuybackId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleStartEdit(item)}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => setPendingDeleteBuybackId(item.id)}>Delete</button>
                          </>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              ))}
              {filteredBuybacks.length === 0 && (
                <tr>
                  <td colSpan={8} className="buyback-empty">No buyback requests found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Buyback;

