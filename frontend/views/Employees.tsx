import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createEmployee,
  createStore,
  deleteEmployee,
  deleteStore,
  listEmployees,
  updateEmployee,
  updateStore,
  type ApiEmployee,
  type ApiStore,
} from '../services/api';
import { User, isPrivilegedUser } from '../types';
import './Employees.css';

interface EmployeesProps {
  user: User;
  stores?: ApiStore[];
  onStoresUpdate?: () => void;
}

const Employees: React.FC<EmployeesProps> = ({ user, stores = [], onStoresUpdate }) => {
  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' };
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();
  const [filterRole, setFilterRole] = useState('All');
  const [filterStore, setFilterStore] = useState('All Stores');
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // ... (rest of states)
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [formError, setFormError] = useState('');
  const [storeCreating, setStoreCreating] = useState(false);
  const [storeUpdating, setStoreUpdating] = useState(false);
  const [storeFormError, setStoreFormError] = useState('');
  const [editFormError, setEditFormError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [pendingDeleteEmployeeId, setPendingDeleteEmployeeId] = useState<string | null>(null);
  const [pendingDeleteStoreId, setPendingDeleteStoreId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    role: 'Staff' as ApiEmployee['role'],
    store: 'Main Branch',
    store_ref: '',
    email: '',
    phone: '',
    username: '',
    password: '',
  });
  const [storeForm, setStoreForm] = useState({
    name: '',
    code: '',
    store_type: 'addon' as 'main' | 'addon',
    parent: '',
  });
  const [editFormData, setEditFormData] = useState({
    name: '',
    role: 'Staff' as ApiEmployee['role'],
    store: '',
    store_ref: '',
    email: '',
    phone: '',
    username: '',
    password: '',
  });
  const [editStoreForm, setEditStoreForm] = useState({
    name: '',
    code: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const employeeData = await listEmployees();
        setEmployees(employeeData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load employees');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    setFilterStore(searchParams.get('store') || 'All Stores');
  }, [searchParams]);

  const roles = ['All', 'Manager', 'Salesman', 'Technician', 'Staff'];
  const storesForFilter = useMemo(() => ['All Stores', ...Array.from(new Set(employees.map((employee) => employee.store || 'Unassigned')))], [employees]);
  const editingEmployee = useMemo(
    () => employees.find((item) => item.id === editingEmployeeId) || null,
    [employees, editingEmployeeId]
  );

  const filteredEmployees = employees.filter((employee) => {
    const roleOk = filterRole === 'All' || employee.role === filterRole;
    const empStore = employee.store || 'Unassigned';
    const storeOk = filterStore === 'All Stores' || empStore === filterStore;
    const queryOk = !q || employee.name.toLowerCase().includes(q) || (employee.email || '').toLowerCase().includes(q) || (employee.phone || '').includes(q);
    return roleOk && storeOk && queryOk;
  });

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setStatusMessage('');

    if (!formData.name.trim()) {
      setFormError('Employee name is required.');
      return;
    }
    if (!formData.store_ref) {
      setFormError('Please select a store for the employee.');
      return;
    }
    if (formData.username.trim() && !formData.password) {
      setFormError('Password is required when username is provided.');
      return;
    }

    try {
      setCreating(true);
      const store = stores.find((item) => item.id === formData.store_ref);
      const created = await createEmployee({
        name: formData.name.trim(),
        role: formData.role,
        store: store?.name || '',
        store_ref: formData.store_ref,
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        ...(formData.username.trim() ? { username: formData.username.trim(), password: formData.password } : {}),
        sales_count: 0,
        join_date: new Date().toISOString().slice(0, 10),
      });
      setEmployees((prev) => [created, ...prev]);
      setFormData({
        name: '',
        role: 'Staff',
        store: 'Main Branch',
        store_ref: '',
        email: '',
        phone: '',
        username: '',
        password: '',
      });
      setStatusMessage('Employee added successfully.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create employee');
    } finally {
      setCreating(false);
    }
  };

  const handleStartEditEmployee = (employee: ApiEmployee) => {
    setStatusMessage('');
    setEditingEmployeeId(employee.id);
    setEditFormError('');
    setEditFormData({
      name: employee.name,
      role: employee.role,
      store: employee.store || '',
      store_ref: employee.store_ref ? String(employee.store_ref) : '',
      email: employee.email || '',
      phone: employee.phone || '',
      username: employee.login_username || '',
      password: '',
    });
  };

  const handleEditEmployee = async (employee: ApiEmployee) => {
    setStatusMessage('');
    const store = stores.find((item) => item.id === editFormData.store_ref);
    if (!editFormData.name.trim()) {
      setEditFormError('Employee name is required.');
      return;
    }
    if (!employee.login_username && (editFormData.username.trim() || editFormData.password) && (!editFormData.username.trim() || !editFormData.password)) {
      setEditFormError('Both username and password are required to create employee login.');
      return;
    }
    try {
      setUpdating(true);
      setEditFormError('');
      const updated = await updateEmployee(employee.id, {
        name: editFormData.name.trim(),
        role: editFormData.role,
        email: editFormData.email.trim(),
        phone: editFormData.phone.trim(),
        store_ref: editFormData.store_ref ? editFormData.store_ref : null,
        store: store?.name || editFormData.store,
        ...(editFormData.username.trim() ? { username: editFormData.username.trim() } : {}),
        ...(editFormData.password ? { password: editFormData.password } : {}),
      });
      setEmployees((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingEmployeeId(null);
      setStatusMessage('Employee updated successfully.');
    } catch (err) {
      setEditFormError(err instanceof Error ? err.message : 'Unable to update employee');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteEmployee = async (employee: ApiEmployee) => {
    setStatusMessage('');
    try {
      await deleteEmployee(employee.id);
      setEmployees((prev) => prev.filter((item) => item.id !== employee.id));
      setPendingDeleteEmployeeId(null);
      setStatusMessage('Employee deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete employee');
    }
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setStoreFormError('');
    setStatusMessage('');
    if (!storeForm.name.trim() || !storeForm.code.trim()) {
      setStoreFormError('Store name and code are required.');
      return;
    }

    try {
      setStoreCreating(true);
      await createStore({
        name: storeForm.name.trim(),
        code: storeForm.code.trim().toUpperCase(),
        store_type: storeForm.store_type,
        parent: storeForm.parent ? Number(storeForm.parent) : null,
        is_active: true,
      });
      onStoresUpdate?.();
      setStoreForm({ name: '', code: '', store_type: 'addon', parent: '' });
      setStatusMessage('Store added successfully.');
    } catch (err) {
      setStoreFormError(err instanceof Error ? err.message : 'Unable to create store');
    } finally {
      setStoreCreating(false);
    }
  };

  const handleStartEditStore = (store: ApiStore) => {
    setStatusMessage('');
    setEditingStoreId(store.id);
    setStoreFormError('');
    setEditStoreForm({ name: store.name, code: store.code });
  };

  const handleEditStore = async (store: ApiStore) => {
    try {
      setStoreUpdating(true);
      await updateStore(store.id, {
        name: editStoreForm.name.trim(),
        code: editStoreForm.code.trim().toUpperCase(),
      });
      onStoresUpdate?.();
      setEditingStoreId(null);
      setStatusMessage('Store updated successfully.');
    } catch (err) {
      setStoreFormError(err instanceof Error ? err.message : 'Unable to update store');
    } finally {
      setStoreUpdating(false);
    }
  };

  const handleDeleteStore = async (store: ApiStore) => {
    setStatusMessage('');
    try {
      await deleteStore(store.id);
      onStoresUpdate?.();
      setPendingDeleteStoreId(null);
      setStatusMessage('Store deleted successfully.');
    } catch (err) {
      setStoreFormError(err instanceof Error ? err.message : 'Unable to delete store');
    }
  };

  return (
    <div className="employees-container">
      <div className="employees-header">
        <h1>Employee Management</h1>
      </div>

      {isPrivilegedUser(user) && (
        <form onSubmit={handleAddEmployee} className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Add Employee Credentials</h3>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div style={fieldStyle}><label style={labelStyle}>Employee Name</label><input className="form-input" placeholder="Name *" value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Role</label><select className="form-input" value={formData.role} onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value as ApiEmployee['role'] }))}>
              <option value="Manager">Manager</option>
              <option value="Salesman">Salesman</option>
              <option value="Technician">Technician</option>
              <option value="Staff">Staff</option>
            </select></div>
            <div style={fieldStyle}><label style={labelStyle}>Store</label><select className="form-input" value={formData.store_ref} onChange={(e) => setFormData((prev) => ({ ...prev, store_ref: e.target.value, store: stores.find((item) => item.id === e.target.value)?.name || '' }))}>
              <option value="">Select Store</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select></div>
            <div style={fieldStyle}><label style={labelStyle}>Email Address</label><input className="form-input" placeholder="Email" value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Phone Number</label><input className="form-input" placeholder="Phone" value={formData.phone} onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Login Username</label><input className="form-input" placeholder="Username (login)" value={formData.username} onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Login Password</label><input type="password" className="form-input" placeholder="Password (login)" value={formData.password} onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))} /></div>
          </div>
          {formError && <p style={{ color: 'var(--color-error-600)', margin: '8px 0 0' }}>{formError}</p>}
          <button className="btn btn-primary" type="submit" style={{ marginTop: 12 }} disabled={creating}>
            {creating ? 'Creating...' : '+ Add Employee'}
          </button>
        </form>
      )}

      {isPrivilegedUser(user) && editingEmployeeId !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const employee = employees.find((item) => item.id === editingEmployeeId);
            if (employee) {
              void handleEditEmployee(employee);
            }
          }}
          className="card"
          style={{ marginBottom: 16, padding: 16 }}
        >
          <h3 style={{ marginTop: 0 }}>Edit Employee</h3>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div style={fieldStyle}><label style={labelStyle}>Employee Name</label><input className="form-input" placeholder="Name *" value={editFormData.name} onChange={(e) => setEditFormData((prev) => ({ ...prev, name: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Role</label><select className="form-input" value={editFormData.role} onChange={(e) => setEditFormData((prev) => ({ ...prev, role: e.target.value as ApiEmployee['role'] }))}>
              <option value="Manager">Manager</option>
              <option value="Salesman">Salesman</option>
              <option value="Technician">Technician</option>
              <option value="Staff">Staff</option>
            </select></div>
            <div style={fieldStyle}><label style={labelStyle}>Store</label><select className="form-input" value={editFormData.store_ref} onChange={(e) => setEditFormData((prev) => ({ ...prev, store_ref: e.target.value, store: stores.find((item) => item.id === e.target.value)?.name || '' }))}>
              <option value="">Select Store</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select></div>
            <div style={fieldStyle}><label style={labelStyle}>Email Address</label><input className="form-input" placeholder="Email" value={editFormData.email} onChange={(e) => setEditFormData((prev) => ({ ...prev, email: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Phone Number</label><input className="form-input" placeholder="Phone" value={editFormData.phone} onChange={(e) => setEditFormData((prev) => ({ ...prev, phone: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Login Username</label><input className="form-input" placeholder="Username (login)" value={editFormData.username} onChange={(e) => setEditFormData((prev) => ({ ...prev, username: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Login Password</label><input type="password" className="form-input" placeholder={editingEmployee?.login_username ? 'Leave blank to keep current password' : 'Password (login)'} value={editFormData.password} onChange={(e) => setEditFormData((prev) => ({ ...prev, password: e.target.value }))} /></div>
          </div>
          {editFormError && <p style={{ color: 'var(--color-error-600)', margin: '8px 0 0' }}>{editFormError}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" type="submit" disabled={updating}>{updating ? 'Saving...' : 'Save Changes'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setEditingEmployeeId(null)}>Cancel</button>
          </div>
        </form>
      )}

      {isPrivilegedUser(user) && (
        <form onSubmit={handleAddStore} className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Store Management</h3>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div style={fieldStyle}><label style={labelStyle}>Store Name</label><input className="form-input" placeholder="Store Name" value={storeForm.name} onChange={(e) => setStoreForm((prev) => ({ ...prev, name: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Store Code</label><input className="form-input" placeholder="Store Code" value={storeForm.code} onChange={(e) => setStoreForm((prev) => ({ ...prev, code: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Store Type</label><select className="form-input" value={storeForm.store_type} onChange={(e) => setStoreForm((prev) => ({ ...prev, store_type: e.target.value as 'main' | 'addon' }))}>
              <option value="main">Main Branch</option>
              <option value="addon">Addon Branch</option>
            </select></div>
            <div style={fieldStyle}><label style={labelStyle}>Parent Store</label><select className="form-input" value={storeForm.parent} onChange={(e) => setStoreForm((prev) => ({ ...prev, parent: e.target.value }))}>
              <option value="">No Parent</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select></div>
          </div>
          {storeFormError && <p style={{ color: 'var(--color-error-600)', margin: '8px 0 0' }}>{storeFormError}</p>}
          <button className="btn btn-primary" type="submit" style={{ marginTop: 12 }} disabled={storeCreating}>
            {storeCreating ? 'Creating...' : '+ Add Store'}
          </button>
          {editingStoreId !== null && (
            <div className="card" style={{ marginTop: 16, padding: 16 }}>
              <h4 style={{ marginTop: 0 }}>Edit Store</h4>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div style={fieldStyle}><label style={labelStyle}>Store Name</label><input className="form-input" placeholder="Store Name" value={editStoreForm.name} onChange={(e) => setEditStoreForm((prev) => ({ ...prev, name: e.target.value }))} /></div>
                <div style={fieldStyle}><label style={labelStyle}>Store Code</label><input className="form-input" placeholder="Store Code" value={editStoreForm.code} onChange={(e) => setEditStoreForm((prev) => ({ ...prev, code: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    const store = stores.find((item) => item.id === editingStoreId);
                    if (store) {
                      void handleEditStore(store);
                    }
                  }}
                  disabled={storeUpdating}
                >
                  {storeUpdating ? 'Saving...' : 'Save Store'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setEditingStoreId(null)}>Cancel</button>
              </div>
            </div>
          )}
          <div className="table-wrapper" style={{ marginTop: 16 }}>
            <table className="employees-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Parent</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td>{store.name}</td>
                    <td>{store.code}</td>
                    <td>{store.store_type}</td>
                    <td>{store.parent ? stores.find((item) => item.id === store.parent)?.name || '-' : '-'}</td>
                    <td>
                      {pendingDeleteStoreId === store.id ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-danger btn-sm" type="button" onClick={() => void handleDeleteStore(store)}>Confirm</button>
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => setPendingDeleteStoreId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => handleStartEditStore(store)}>Edit</button>
                          <button className="btn btn-danger btn-sm" type="button" onClick={() => setPendingDeleteStoreId(store.id)}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </form>
      )}

      {loading && <p>Loading employees...</p>}
      {error && <p style={{ color: 'var(--color-error-600)' }}>{error}</p>}
      {!error && statusMessage && <p style={{ color: 'var(--color-success-600)' }}>{statusMessage}</p>}

      <div className="filter-section" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="role-filter">
          {roles.map((role) => (
            <button key={role} className={`filter-btn ${filterRole === role ? 'active' : ''}`} onClick={() => setFilterRole(role)}>
              {role}
            </button>
          ))}
        </div>
        <select value={filterStore} onChange={(e) => setFilterStore(e.target.value)} className="form-input" style={{ maxWidth: 220 }}>
          {storesForFilter.map((store) => <option key={store} value={store}>{store}</option>)}
        </select>
      </div>

      <div className="table-wrapper">
        <table className="employees-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Store</th>
              <th>Login</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Sales/Tickets</th>
              <th>Join Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((employee) => (
              <tr key={employee.id}>
                <td className="name-cell"><div className="avatar">{employee.name.charAt(0)}</div><div className="name-info"><strong>{employee.name}</strong><span className="emp-id">EMP{String(employee.id).padStart(4, '0')}</span></div></td>
                <td><span className="role-badge">{employee.role}</span></td>
                <td>{employee.store || 'Unassigned'}</td>
                <td>{employee.login_username || '-'}</td>
                <td className="email-cell">{employee.email || '-'}</td>
                <td className="phone-cell">{employee.phone || '-'}</td>
                <td className="sales-cell"><strong>{employee.sales_count}</strong></td>
                <td className="date-cell">{employee.join_date || '-'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {isPrivilegedUser(user) && <button className="btn btn-secondary btn-sm" type="button" onClick={() => handleStartEditEmployee(employee)}>Edit</button>}
                    {isPrivilegedUser(user) && pendingDeleteEmployeeId === employee.id && (
                      <>
                        <button className="btn btn-danger btn-sm" type="button" onClick={() => void handleDeleteEmployee(employee)}>Confirm</button>
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => setPendingDeleteEmployeeId(null)}>Cancel</button>
                      </>
                    )}
                    {isPrivilegedUser(user) && pendingDeleteEmployeeId !== employee.id && (
                      <button className="btn btn-danger btn-sm" type="button" onClick={() => setPendingDeleteEmployeeId(employee.id)}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filteredEmployees.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 16 }}>No employees found</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="stats-section">
        <div className="stat-card"><h4>Total Employees</h4><p className="stat-value">{employees.length}</p></div>
        <div className="stat-card"><h4>Managers</h4><p className="stat-value">{employees.filter((employee) => employee.role === 'Manager').length}</p></div>
        <div className="stat-card"><h4>Salesmen</h4><p className="stat-value">{employees.filter((employee) => employee.role === 'Salesman').length}</p></div>
        <div className="stat-card"><h4>Technicians</h4><p className="stat-value">{employees.filter((employee) => employee.role === 'Technician').length}</p></div>
      </div>
    </div>
  );
};

export default Employees;

