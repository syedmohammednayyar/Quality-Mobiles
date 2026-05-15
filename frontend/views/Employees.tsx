import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createEmployee,
  deleteEmployee,
  listCredentialAccounts,
  listEmployeeAccessStores,
  listEmployees,
  resetCredentialPassword,
  updateCredentialStatus,
  updateEmployee,
  updateStore,
  type ApiCredentialAccount,
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

const emptyUserForm = {
  name: '',
  role: 'Staff' as ApiEmployee['role'],
  store_ref: '',
  email: '',
  phone: '',
  username: '',
  password: '',
};

const Employees: React.FC<EmployeesProps> = ({ user, stores = [], onStoresUpdate }) => {
  const isAdmin = user.role === 'Admin';
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').toLowerCase();
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [credentials, setCredentials] = useState<ApiCredentialAccount[]>([]);
  const [managedStores, setManagedStores] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [storeUpdating, setStoreUpdating] = useState(false);
  const [formError, setFormError] = useState('');
  const [editFormError, setEditFormError] = useState('');
  const [storeFormError, setStoreFormError] = useState('');
  const [passwordResetError, setPasswordResetError] = useState('');
  const [filterRole, setFilterRole] = useState('All');
  const [filterStore, setFilterStore] = useState('All Stores');
  const [filterStatus, setFilterStatus] = useState('All Statuses');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [pendingDeleteEmployeeId, setPendingDeleteEmployeeId] = useState<string | null>(null);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [passwordResetEmployeeId, setPasswordResetEmployeeId] = useState<string | null>(null);
  const [passwordResetValue, setPasswordResetValue] = useState('');
  const [formData, setFormData] = useState(emptyUserForm);
  const [editFormData, setEditFormData] = useState(emptyUserForm);
  const [editStoreForm, setEditStoreForm] = useState({ name: '', code: '' });

  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' };

  const loadScreen = async () => {
    const [employeeRows, credentialRows, accessStores] = await Promise.all([
      listEmployees(),
      listCredentialAccounts({}),
      isPrivilegedUser(user) ? listEmployeeAccessStores() : Promise.resolve([]),
    ]);
    setEmployees(employeeRows);
    setCredentials(credentialRows);
    setManagedStores(accessStores);
  };

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError('');
        await loadScreen();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load user management data');
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    setFilterStore(searchParams.get('store') || 'All Stores');
  }, [searchParams]);

  const managedStoreIds = useMemo(() => new Set(managedStores.map((store) => store.id)), [managedStores]);
  const visibleStores = useMemo(
    () => (isAdmin ? stores : stores.filter((store) => managedStoreIds.has(store.id))),
    [isAdmin, managedStoreIds, stores],
  );
  const credentialByEmployeeId = useMemo(() => {
    const map = new Map<string, ApiCredentialAccount>();
    credentials.forEach((credential) => {
      if (credential.employee_id) map.set(String(credential.employee_id), credential);
    });
    return map;
  }, [credentials]);
  const editingEmployee = useMemo(
    () => employees.find((employee) => employee.id === editingEmployeeId) || null,
    [editingEmployeeId, employees],
  );

  const filtersRole = ['All', 'Manager', 'Salesman', 'Technician', 'Staff'];
  const filtersStatus = ['All Statuses', 'approved', 'suspended', 'deactivated', 'locked'];
  const storeOptions = ['All Stores', ...Array.from(new Set(employees.map((employee) => employee.store || 'Unassigned')))];

  const filteredEmployees = employees.filter((employee) => {
    const credential = credentialByEmployeeId.get(employee.id);
    const roleOk = filterRole === 'All' || employee.role === filterRole;
    const storeOk = filterStore === 'All Stores' || (employee.store || 'Unassigned') === filterStore;
    const statusOk = filterStatus === 'All Statuses' || credential?.status === filterStatus;
    const queryOk = !query
      || employee.name.toLowerCase().includes(query)
      || (employee.email || '').toLowerCase().includes(query)
      || (employee.phone || '').includes(query)
      || (employee.login_username || '').toLowerCase().includes(query);
    return roleOk && storeOk && statusOk && queryOk;
  });

  const resetCreateForm = () => {
    setFormData(emptyUserForm);
    setFormError('');
  };

  const handleAddEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setStatusMessage('');

    if (!formData.name.trim()) return setFormError('Full name is required.');
    if (!formData.store_ref) return setFormError('Please assign a store.');
    if (!formData.email.trim()) return setFormError('Email is required.');
    if (!formData.password || formData.password.length < 8) return setFormError('Password must be at least 8 characters.');

    try {
      setCreating(true);
      const created = await createEmployee({
        name: formData.name.trim(),
        role: formData.role,
        store: visibleStores.find((store) => store.id === formData.store_ref)?.name || '',
        store_ref: formData.store_ref,
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        username: formData.username.trim() || undefined,
        password: formData.password,
        join_date: new Date().toISOString().slice(0, 10),
      });
      setEmployees((current) => [created, ...current]);
      await loadScreen();
      resetCreateForm();
      setStatusMessage('User created successfully.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleStartEditEmployee = (employee: ApiEmployee) => {
    setEditingEmployeeId(employee.id);
    setEditFormError('');
    setStatusMessage('');
    setEditFormData({
      name: employee.name,
      role: employee.role,
      store_ref: employee.store_ref ? String(employee.store_ref) : '',
      email: employee.email || '',
      phone: employee.phone || '',
      username: employee.login_username || '',
      password: '',
    });
  };

  const handleEditEmployee = async (employee: ApiEmployee) => {
    setEditFormError('');
    setStatusMessage('');
    if (!editFormData.name.trim()) return setEditFormError('Full name is required.');
    if (!editFormData.store_ref) return setEditFormError('Store assignment is required.');

    try {
      setUpdating(true);
      const updated = await updateEmployee(employee.id, {
        name: editFormData.name.trim(),
        role: editFormData.role,
        store_ref: editFormData.store_ref,
        email: editFormData.email.trim(),
        phone: editFormData.phone.trim(),
        username: editFormData.username.trim() || undefined,
        password: editFormData.password || undefined,
      });
      setEmployees((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      await loadScreen();
      setEditingEmployeeId(null);
      setStatusMessage('User updated successfully.');
    } catch (err) {
      setEditFormError(err instanceof Error ? err.message : 'Unable to update user');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteEmployee = async (employee: ApiEmployee) => {
    try {
      await deleteEmployee(employee.id);
      setEmployees((current) => current.filter((entry) => entry.id !== employee.id));
      await loadScreen();
      setPendingDeleteEmployeeId(null);
      setStatusMessage('User deactivated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete user');
    }
  };

  const handleStatusUpdate = async (employeeId: string, status: ApiCredentialAccount['status']) => {
    try {
      await updateCredentialStatus(employeeId, status);
      await loadScreen();
      setStatusMessage('Account status updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update account status');
    }
  };

  const handlePasswordReset = async (employeeId: string) => {
    setPasswordResetError('');
    if (!passwordResetValue || passwordResetValue.length < 8) {
      setPasswordResetError('Password must be at least 8 characters.');
      return;
    }

    try {
      await resetCredentialPassword(employeeId, passwordResetValue);
      setPasswordResetEmployeeId(null);
      setPasswordResetValue('');
      setStatusMessage('Password reset successfully.');
    } catch (err) {
      setPasswordResetError(err instanceof Error ? err.message : 'Unable to reset password');
    }
  };

  const handleStartEditStore = (store: ApiStore) => {
    setEditingStoreId(store.id);
    setStoreFormError('');
    setEditStoreForm({ name: store.name, code: store.code });
  };

  const handleEditStore = async (store: ApiStore) => {
    try {
      setStoreUpdating(true);
      await updateStore(store.id, {
        name: editStoreForm.name.trim(),
        code: isAdmin ? editStoreForm.code.trim().toUpperCase() : undefined,
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

  return (
    <div className="employees-container">
      <div className="employees-header">
        <div>
          <h1>User Management</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
            Internal account provisioning only. Public signup has been removed.
          </p>
        </div>
      </div>

      {isPrivilegedUser(user) && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Account Status Overview</h3>
          <div className="table-wrapper">
            <table className="employees-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Approval</th>
                  <th>Attempts</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((credential) => (
                  <tr key={credential.id}>
                    <td>{credential.employee_name || '-'}</td>
                    <td>{credential.email}</td>
                    <td>{credential.status}</td>
                    <td>{credential.approval_status}</td>
                    <td>{credential.login_attempts}</td>
                    <td>{credential.last_login ? new Date(credential.last_login).toLocaleString() : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => credential.employee_id && void handleStatusUpdate(String(credential.employee_id), 'approved')}>Activate</button>
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => credential.employee_id && void handleStatusUpdate(String(credential.employee_id), 'suspended')}>Suspend</button>
                        {isAdmin && <button className="btn btn-danger btn-sm" type="button" onClick={() => credential.employee_id && void handleStatusUpdate(String(credential.employee_id), 'deactivated')}>Deactivate</button>}
                        {isAdmin && credential.employee_id && (
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => {
                            setPasswordResetEmployeeId(String(credential.employee_id));
                            setPasswordResetValue('');
                            setPasswordResetError('');
                          }}>
                            Reset Password
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {credentials.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 16 }}>No account records found</td></tr>}
              </tbody>
            </table>
          </div>
          {passwordResetEmployeeId && (
            <div className="card" style={{ marginTop: 16, padding: 16 }}>
              <h4 style={{ marginTop: 0 }}>Reset Password</h4>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(240px, 360px)' }}>
                <input
                  type="password"
                  className="form-input"
                  placeholder="New password"
                  value={passwordResetValue}
                  onChange={(e) => setPasswordResetValue(e.target.value)}
                />
              </div>
              {passwordResetError && <p style={{ color: 'var(--color-error-600)', margin: '10px 0 0' }}>{passwordResetError}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" type="button" onClick={() => void handlePasswordReset(passwordResetEmployeeId)}>Save Password</button>
                <button className="btn btn-secondary" type="button" onClick={() => setPasswordResetEmployeeId(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {isPrivilegedUser(user) && (
        <form onSubmit={handleAddEmployee} className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{isAdmin ? 'Add User' : 'Add Employee'}</h3>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div style={fieldStyle}><label style={labelStyle}>Full Name</label><input className="form-input" value={formData.name} onChange={(e) => setFormData((current) => ({ ...current, name: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Role</label><select className="form-input" value={formData.role} onChange={(e) => setFormData((current) => ({ ...current, role: e.target.value as ApiEmployee['role'] }))}>
              {isAdmin && <option value="Manager">Manager</option>}
              <option value="Salesman">Salesman</option>
              <option value="Technician">Technician</option>
              <option value="Staff">Staff</option>
            </select></div>
            <div style={fieldStyle}><label style={labelStyle}>Assigned Store</label><select className="form-input" value={formData.store_ref} onChange={(e) => setFormData((current) => ({ ...current, store_ref: e.target.value }))}>
              <option value="">Select Store</option>
              {visibleStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select></div>
            <div style={fieldStyle}><label style={labelStyle}>Email</label><input className="form-input" value={formData.email} onChange={(e) => setFormData((current) => ({ ...current, email: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Phone</label><input className="form-input" value={formData.phone} onChange={(e) => setFormData((current) => ({ ...current, phone: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Username</label><input className="form-input" value={formData.username} onChange={(e) => setFormData((current) => ({ ...current, username: e.target.value }))} placeholder="Optional" /></div>
            <div style={fieldStyle}><label style={labelStyle}>Password</label><input type="password" className="form-input" value={formData.password} onChange={(e) => setFormData((current) => ({ ...current, password: e.target.value }))} placeholder="Minimum 8 characters" /></div>
          </div>
          {formError && <p style={{ color: 'var(--color-error-600)', margin: '8px 0 0' }}>{formError}</p>}
          <button className="btn btn-primary" type="submit" style={{ marginTop: 12 }} disabled={creating}>
            {creating ? 'Creating...' : isAdmin ? 'Create User' : 'Create Employee'}
          </button>
        </form>
      )}

      {editingEmployeeId && editingEmployee && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleEditEmployee(editingEmployee);
          }}
          className="card"
          style={{ marginBottom: 16, padding: 16 }}
        >
          <h3 style={{ marginTop: 0 }}>Edit User</h3>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div style={fieldStyle}><label style={labelStyle}>Full Name</label><input className="form-input" value={editFormData.name} onChange={(e) => setEditFormData((current) => ({ ...current, name: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Role</label><select className="form-input" value={editFormData.role} onChange={(e) => setEditFormData((current) => ({ ...current, role: e.target.value as ApiEmployee['role'] }))}>
              {isAdmin && <option value="Manager">Manager</option>}
              <option value="Salesman">Salesman</option>
              <option value="Technician">Technician</option>
              <option value="Staff">Staff</option>
            </select></div>
            <div style={fieldStyle}><label style={labelStyle}>Assigned Store</label><select className="form-input" value={editFormData.store_ref} onChange={(e) => setEditFormData((current) => ({ ...current, store_ref: e.target.value }))}>
              <option value="">Select Store</option>
              {visibleStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select></div>
            <div style={fieldStyle}><label style={labelStyle}>Email</label><input className="form-input" value={editFormData.email} onChange={(e) => setEditFormData((current) => ({ ...current, email: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Phone</label><input className="form-input" value={editFormData.phone} onChange={(e) => setEditFormData((current) => ({ ...current, phone: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>Username</label><input className="form-input" value={editFormData.username} onChange={(e) => setEditFormData((current) => ({ ...current, username: e.target.value }))} /></div>
            <div style={fieldStyle}><label style={labelStyle}>New Password</label><input type="password" className="form-input" value={editFormData.password} onChange={(e) => setEditFormData((current) => ({ ...current, password: e.target.value }))} placeholder="Leave blank to keep current password" /></div>
          </div>
          {editFormError && <p style={{ color: 'var(--color-error-600)', margin: '8px 0 0' }}>{editFormError}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" type="submit" disabled={updating}>{updating ? 'Saving...' : 'Save Changes'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setEditingEmployeeId(null)}>Cancel</button>
          </div>
        </form>
      )}

      {isPrivilegedUser(user) && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Store Configuration</h3>
          <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>
            Stores are fixed system entities. This screen supports edit-only configuration.
          </p>
          {storeFormError && <p style={{ color: 'var(--color-error-600)', margin: '8px 0 0' }}>{storeFormError}</p>}
          {editingStoreId && (
            <div className="card" style={{ marginTop: 16, padding: 16 }}>
              <h4 style={{ marginTop: 0 }}>Edit Store</h4>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div style={fieldStyle}><label style={labelStyle}>Store Name</label><input className="form-input" value={editStoreForm.name} onChange={(e) => setEditStoreForm((current) => ({ ...current, name: e.target.value }))} /></div>
                <div style={fieldStyle}><label style={labelStyle}>Store Code</label><input className="form-input" value={editStoreForm.code} onChange={(e) => setEditStoreForm((current) => ({ ...current, code: e.target.value }))} disabled={!isAdmin} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" type="button" onClick={() => {
                  const store = visibleStores.find((entry) => entry.id === editingStoreId);
                  if (store) void handleEditStore(store);
                }} disabled={storeUpdating}>{storeUpdating ? 'Saving...' : 'Save Store'}</button>
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
                {visibleStores.map((store) => (
                  <tr key={store.id}>
                    <td>{store.name}</td>
                    <td>{store.code}</td>
                    <td>{store.store_type}</td>
                    <td>{store.parent ? stores.find((entry) => entry.id === store.parent)?.name || '-' : '-'}</td>
                    <td><button className="btn btn-secondary btn-sm" type="button" onClick={() => handleStartEditStore(store)}>Edit</button></td>
                  </tr>
                ))}
                {visibleStores.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 16 }}>No stores available</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && <p>Loading users...</p>}
      {error && <p style={{ color: 'var(--color-error-600)' }}>{error}</p>}
      {!error && statusMessage && <p style={{ color: 'var(--color-success-600)' }}>{statusMessage}</p>}

      <div className="filter-section" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="role-filter">
          {filtersRole.map((role) => (
            <button key={role} className={`filter-btn ${filterRole === role ? 'active' : ''}`} onClick={() => setFilterRole(role)}>
              {role}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <select value={filterStore} onChange={(e) => setFilterStore(e.target.value)} className="form-input" style={{ maxWidth: 220 }}>
            {storeOptions.map((store) => <option key={store} value={store}>{store}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="form-input" style={{ maxWidth: 220 }}>
            {filtersStatus.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
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
              <th>Account Status</th>
              <th>Sales/Tickets</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((employee) => {
              const credential = credentialByEmployeeId.get(employee.id);
              return (
                <tr key={employee.id}>
                  <td className="name-cell"><div className="avatar">{employee.name.charAt(0)}</div><div className="name-info"><strong>{employee.name}</strong><span className="emp-id">{employee.id.slice(-6).toUpperCase()}</span></div></td>
                  <td><span className="role-badge">{employee.role}</span></td>
                  <td>{employee.store || 'Unassigned'}</td>
                  <td>{employee.login_username || '-'}</td>
                  <td className="email-cell">{employee.email || '-'}</td>
                  <td className="phone-cell">{employee.phone || '-'}</td>
                  <td>{credential?.status || 'approved'}</td>
                  <td className="sales-cell"><strong>{employee.sales_count}</strong></td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => handleStartEditEmployee(employee)}>Edit</button>
                      {isAdmin && pendingDeleteEmployeeId === employee.id ? (
                        <>
                          <button className="btn btn-danger btn-sm" type="button" onClick={() => void handleDeleteEmployee(employee)}>Confirm</button>
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => setPendingDeleteEmployeeId(null)}>Cancel</button>
                        </>
                      ) : null}
                      {isAdmin && pendingDeleteEmployeeId !== employee.id && (
                        <button className="btn btn-danger btn-sm" type="button" onClick={() => setPendingDeleteEmployeeId(employee.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && filteredEmployees.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 16 }}>No users found</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="stats-section">
        <div className="stat-card"><h4>Total Users</h4><p className="stat-value">{employees.length}</p></div>
        <div className="stat-card"><h4>Managers</h4><p className="stat-value">{employees.filter((employee) => employee.role === 'Manager').length}</p></div>
        <div className="stat-card"><h4>Active Accounts</h4><p className="stat-value">{credentials.filter((credential) => credential.status === 'approved').length}</p></div>
        <div className="stat-card"><h4>Suspended/Locked</h4><p className="stat-value">{credentials.filter((credential) => credential.status === 'suspended' || credential.status === 'locked').length}</p></div>
      </div>
    </div>
  );
};

export default Employees;
