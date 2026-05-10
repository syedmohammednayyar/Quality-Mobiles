import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  listSales,
  listStores,
  updateCustomer,
  type ApiCustomer,
  type ApiSale,
  type ApiStore,
} from '../services/api';
import { User, isPrivilegedUser } from '../types';
import './Customers.css';

type CustomerWithStats = ApiCustomer & {
  totalSpent: number;
  purchases: number;
  lastVisit: string;
};

interface CustomersProps {
  user: User;
}

const Customers: React.FC<CustomersProps> = ({ user }) => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [sales, setSales] = useState<ApiSale[]>([]);
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [formError, setFormError] = useState('');
  const [editFormError, setEditFormError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [pendingDeleteCustomerId, setPendingDeleteCustomerId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    store_ref: '',
  });
  const [editFormData, setEditFormData] = useState({
    name: '',
    phone: '',
    email: '',
    store_ref: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [customerData, salesData, storeData] = await Promise.all([listCustomers(), listSales(), listStores()]);
        setCustomers(customerData);
        setSales(salesData);
        setStores(storeData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load customers');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    setSearchTerm(searchParams.get('q') || '');
  }, [searchParams]);

  const storeNameById = useMemo(() => {
    const map = new Map<number, string>();
    stores.forEach((store) => map.set(store.id, store.name));
    return map;
  }, [stores]);

  const customerStats = useMemo<CustomerWithStats[]>(() => {
    return customers.map((customer) => {
      const customerSales = sales.filter((sale) => sale.customer === customer.id);
      const totalSpent = customerSales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
      const lastVisit = customerSales.length > 0 ? customerSales[0].sold_at.slice(0, 10) : customer.created_at.slice(0, 10);

      return {
        ...customer,
        totalSpent,
        purchases: customerSales.length,
        lastVisit,
      };
    });
  }, [customers, sales]);

  const filteredCustomers = customerStats.filter((customer) => {
    const storeName = customer.store_ref ? storeNameById.get(customer.store_ref) || '' : '';
    return customer.name.toLowerCase().includes(searchTerm.toLowerCase())
      || customer.phone.includes(searchTerm)
      || String(customer.id).includes(searchTerm)
      || storeName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getTierBadge = (spent: number) => {
    if (spent >= 200000) return { label: 'Gold', color: '#f59e0b' };
    if (spent >= 100000) return { label: 'Silver', color: '#8b5cf6' };
    if (spent >= 50000) return { label: 'Bronze', color: '#ea580c' };
    return { label: 'Regular', color: '#6b7280' };
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setStatusMessage('');
    if (!formData.name.trim()) {
      setFormError('Customer name is required.');
      return;
    }

    try {
      setCreating(true);
      const created = await createCustomer({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        store_ref: formData.store_ref ? formData.store_ref : null,
      });
      setCustomers((prev) => [created, ...prev]);
      setFormData({ name: '', phone: '', email: '', store_ref: '' });
      setStatusMessage('Customer added successfully.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create customer');
    } finally {
      setCreating(false);
    }
  };

  const handleStartEditCustomer = (customer: ApiCustomer) => {
    setEditingCustomerId(customer.id);
    setStatusMessage('');
    setEditFormError('');
    setEditFormData({
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      store_ref: customer.store_ref ? String(customer.store_ref) : '',
    });
  };

  const handleEditCustomer = async (customer: ApiCustomer) => {
    setStatusMessage('');
    if (!editFormData.name.trim()) {
      setEditFormError('Customer name is required.');
      return;
    }
    try {
      setUpdating(true);
      const updated = await updateCustomer(customer.id, {
        name: editFormData.name.trim(),
        phone: editFormData.phone.trim(),
        email: editFormData.email.trim(),
        store_ref: editFormData.store_ref ? editFormData.store_ref : null,
      });
      setCustomers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingCustomerId(null);
      setStatusMessage('Customer updated successfully.');
    } catch (err) {
      setEditFormError(err instanceof Error ? err.message : 'Unable to update customer');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteCustomer = async (customer: ApiCustomer) => {
    setStatusMessage('');
    try {
      await deleteCustomer(customer.id);
      setCustomers((prev) => prev.filter((item) => item.id !== customer.id));
      setPendingDeleteCustomerId(null);
      setStatusMessage('Customer deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete customer');
    }
  };

  const totalRevenue = customerStats.reduce((sum, customer) => sum + customer.totalSpent, 0);

  return (
    <div className="customers-container customers-page">
      <div className="customers-header card customers-hero">
        <div>
          <h1>Customer Management</h1>
          <p>Track buying patterns, customer tiers, and store-level relationships.</p>
        </div>
      </div>

      {!isPrivilegedUser(user) && (
        <form onSubmit={handleAddCustomer} className="card customers-form">
          <h3 className="customers-form-title">Add Customer</h3>
          <div className="customers-form-grid">
            <div className="customers-field">
              <label className="customers-label">Customer Name</label>
              <input className="form-input" placeholder="Customer Name *" value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="customers-field">
              <label className="customers-label">Phone Number</label>
              <input className="form-input" placeholder="Phone" value={formData.phone} onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div className="customers-field">
              <label className="customers-label">Email Address</label>
              <input className="form-input" placeholder="Email" value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="customers-field">
              <label className="customers-label">Assigned Store</label>
              <select className="form-input" value={formData.store_ref} onChange={(e) => setFormData((prev) => ({ ...prev, store_ref: e.target.value }))}>
                <option value="">Select Store</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </div>
          </div>
          {formError && <p className="customers-form-error">{formError}</p>}
          <button className="btn btn-primary customers-submit" type="submit" disabled={creating}>
            {creating ? 'Creating...' : '+ Add Customer'}
          </button>
        </form>
      )}

      {!isPrivilegedUser(user) && editingCustomerId !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const customer = customers.find((item) => item.id === editingCustomerId);
            if (customer) {
              void handleEditCustomer(customer);
            }
          }}
          className="card customers-form"
        >
          <h3 className="customers-form-title">Edit Customer</h3>
          <div className="customers-form-grid">
            <div className="customers-field">
              <label className="customers-label">Customer Name</label>
              <input className="form-input" placeholder="Customer Name *" value={editFormData.name} onChange={(e) => setEditFormData((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="customers-field">
              <label className="customers-label">Phone Number</label>
              <input className="form-input" placeholder="Phone" value={editFormData.phone} onChange={(e) => setEditFormData((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div className="customers-field">
              <label className="customers-label">Email Address</label>
              <input className="form-input" placeholder="Email" value={editFormData.email} onChange={(e) => setEditFormData((prev) => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="customers-field">
              <label className="customers-label">Assigned Store</label>
              <select className="form-input" value={editFormData.store_ref} onChange={(e) => setEditFormData((prev) => ({ ...prev, store_ref: e.target.value }))}>
                <option value="">Select Store</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </div>
          </div>
          {editFormError && <p className="customers-form-error">{editFormError}</p>}
          <div className="customers-form-actions">
            <button className="btn btn-primary" type="submit" disabled={updating}>{updating ? 'Saving...' : 'Save Changes'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setEditingCustomerId(null)}>Cancel</button>
          </div>
        </form>
      )}

      {loading && <p className="customers-state">Loading customers...</p>}
      {error && <p className="customers-state customers-state-error">{error}</p>}
      {!error && statusMessage && <p className="customers-state">{statusMessage}</p>}

      <div className="search-section">
        <input
          type="text"
          placeholder="Search by name, phone, customer ID or store..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <span className="search-count">{filteredCustomers.length} results</span>
      </div>

      <div className="table-wrapper">
        <table className="customers-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Store</th>
              <th>Tier</th>
              <th>Total Spent</th>
              <th>Purchases</th>
              <th>Last Visit</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((customer) => {
              const tier = getTierBadge(customer.totalSpent);
              return (
                <tr key={customer.id}>
                  <td className="name-cell">
                    <div className="avatar">{customer.name.charAt(0)}</div>
                    <div className="name-info">
                      <strong>{customer.name}</strong>
                      <span className="cust-id">CUST{String(customer.id).padStart(4, '0')}</span>
                    </div>
                  </td>
                  <td className="phone-cell">{customer.phone || '-'}</td>
                  <td className="email-cell">{customer.email || '-'}</td>
                  <td>{customer.store_ref ? storeNameById.get(customer.store_ref) || '-' : '-'}</td>
                  <td>
                    <span className="tier-badge" style={{ borderColor: tier.color }}>
                      {tier.label}
                    </span>
                  </td>
                  <td className="amount-cell">Rs {customer.totalSpent.toLocaleString()}</td>
                  <td className="count-cell"><strong>{customer.purchases}</strong></td>
                  <td className="date-cell">{customer.lastVisit}</td>
                  <td>
                    {!isPrivilegedUser(user) ? (
                      pendingDeleteCustomerId === customer.id ? (
                        <div className="customer-actions">
                          <button className="btn btn-danger btn-sm" type="button" onClick={() => void handleDeleteCustomer(customer)}>Confirm</button>
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => setPendingDeleteCustomerId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div className="customer-actions">
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => handleStartEditCustomer(customer)}>Edit</button>
                          <button className="btn btn-danger btn-sm" type="button" onClick={() => setPendingDeleteCustomerId(customer.id)}>Delete</button>
                        </div>
                      )
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && filteredCustomers.length === 0 && (
              <tr>
                <td colSpan={9} className="customers-empty">No customers found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <h4>Total Customers</h4>
          <p className="value">{customerStats.length}</p>
          <span className="subtitle">Active customers</span>
        </div>
        <div className="summary-card">
          <h4>Gold Tier</h4>
          <p className="value">{customerStats.filter((customer) => customer.totalSpent >= 200000).length}</p>
          <span className="subtitle">High value</span>
        </div>
        <div className="summary-card">
          <h4>Total Revenue</h4>
          <p className="value">Rs {(totalRevenue / 100000).toFixed(1)}L</p>
          <span className="subtitle">From customers</span>
        </div>
        <div className="summary-card">
          <h4>Avg. Spent</h4>
          <p className="value">Rs {customerStats.length ? Math.round(totalRevenue / customerStats.length).toLocaleString() : 0}</p>
          <span className="subtitle">Per customer</span>
        </div>
      </div>
    </div>
  );
};

export default Customers;

