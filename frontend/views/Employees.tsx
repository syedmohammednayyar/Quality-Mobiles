import React, { useEffect, useMemo, useState } from 'react';
import {
  createEmployee,
  deleteEmployee,
  listEmployeeAccessStores,
  listEmployees,
  updateEmployee,
  type ApiEmployee,
  type ApiStore,
} from '../services/api';
import { User } from '../types';
import './Employees.css';

interface EmployeesProps {
  user: User;
  stores?: ApiStore[];
}

type UserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  role: ApiEmployee['role'];
  store_ref: string;
  active: boolean;
};

const emptyForm: UserForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  role: 'Employee',
  store_ref: '',
  active: true,
};

const Employees: React.FC<EmployeesProps> = ({ user, stores = [] }) => {
  const isAdmin = user.role === 'Admin';
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [managedStoreIds, setManagedStoreIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [storeFilter, setStoreFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modal, setModal] = useState<'create' | 'edit' | 'view' | 'delete' | null>(null);
  const [selected, setSelected] = useState<ApiEmployee | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadUsers = async () => {
    const [rows, managed] = await Promise.all([
      listEmployees(),
      listEmployeeAccessStores(),
    ]);
    setEmployees(rows);
    setManagedStoreIds(managed.map((store) => store.id));
  };

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await loadUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        setLoading(false);
      }
    })();
  }, [user.id]);

  const visibleStores = useMemo(
    () => stores.filter((store) => store.is_active && (isAdmin || managedStoreIds.includes(store.id))),
    [stores, isAdmin, managedStoreIds],
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees.filter((employee) => {
      const searchOk = !query || [employee.name, employee.email, employee.phone].some((value) => String(value || '').toLowerCase().includes(query));
      const roleOk = roleFilter === 'All' || employee.role === roleFilter;
      const storeOk = storeFilter === 'All' || employee.store_ref === storeFilter;
      const statusOk = statusFilter === 'All' || (statusFilter === 'Active' ? employee.active !== false : employee.active === false);
      return searchOk && roleOk && storeOk && statusOk;
    });
  }, [employees, roleFilter, search, statusFilter, storeFilter]);

  const openCreate = () => {
    setSelected(null);
    setForm({ ...emptyForm, store_ref: visibleStores[0]?.id || '' });
    setError('');
    setModal('create');
  };

  const openEdit = (employee: ApiEmployee) => {
    setSelected(employee);
    setForm({
      ...emptyForm,
      name: employee.name,
      email: employee.email || '',
      phone: employee.phone || '',
      role: employee.role,
      store_ref: employee.store_ref || '',
      active: employee.active !== false,
    });
    setError('');
    setModal('edit');
  };

  const validate = () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.store_ref) return 'Name, email, phone and store are required.';
    if (modal === 'create' && form.password.length < 8) return 'Password must contain at least 8 characters.';
    if (form.password && form.password.length < 8) return 'Password must contain at least 8 characters.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    if (!isAdmin && form.role !== 'Employee') return 'Managers can only create and edit Employees.';
    return '';
  };

  const saveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    try {
      setSaving(true);
      setError('');
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: form.role,
        store: visibleStores.find((store) => store.id === form.store_ref)?.name || '',
        store_ref: form.store_ref,
        password: form.password || undefined,
        active: form.active,
      };
      if (modal === 'edit' && selected) await updateEmployee(selected.id, payload);
      else await createEmployee(payload);
      await loadUsers();
      setModal(null);
      setMessage(modal === 'edit' ? 'User updated successfully.' : 'User created successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save user');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selected || !isAdmin) return;
    try {
      setSaving(true);
      await deleteEmployee(selected.id);
      await loadUsers();
      setModal(null);
      setMessage('User deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="users-page">
      <header className="users-header">
        <div>
          <h1>User Management</h1>
          <p>{employees.length} users</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          <span className="material-icons">person_add</span> Add User
        </button>
      </header>

      <section className="users-toolbar">
        <label className="users-search">
          <span className="material-icons">search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or phone" />
        </label>
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="All">All Roles</option>
          <option value="Manager">Manager</option>
          <option value="Employee">Employee</option>
        </select>
        <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
          <option value="All">All Stores</option>
          {visibleStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </section>

      {error && !modal && <p className="users-notice error">{error}</p>}
      {message && <p className="users-notice success">{message}</p>}

      <section className="users-table-wrap">
        <table className="users-table">
          <thead><tr><th>User Name</th><th>Email</th><th>Phone Number</th><th>Role</th><th>Assigned Store</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody>
            {filteredUsers.map((employee) => (
              <tr key={employee.id}>
                <td><div className="user-name-cell"><span>{employee.name.charAt(0).toUpperCase()}</span><strong>{employee.name}</strong></div></td>
                <td>{employee.email || '-'}</td>
                <td>{employee.phone || '-'}</td>
                <td><span className={`user-role-badge ${employee.role.toLowerCase()}`}>{employee.role}</span></td>
                <td>{employee.store || 'Unassigned'}</td>
                <td><span className={`user-status ${employee.active === false ? 'inactive' : 'active'}`}>{employee.active === false ? 'Inactive' : 'Active'}</span></td>
                <td>{employee.last_login ? new Date(employee.last_login).toLocaleString() : '-'}</td>
                <td><div className="user-actions">
                  <button title="View user" onClick={() => { setSelected(employee); setModal('view'); }}><span className="material-icons">visibility</span></button>
                  <button title="Edit user" onClick={() => openEdit(employee)}><span className="material-icons">edit</span></button>
                  {isAdmin && <button title="Delete user" className="danger" onClick={() => { setSelected(employee); setModal('delete'); }}><span className="material-icons">delete</span></button>}
                </div></td>
              </tr>
            ))}
            {!loading && filteredUsers.length === 0 && <tr><td colSpan={8} className="users-empty">No users found.</td></tr>}
            {loading && <tr><td colSpan={8} className="users-empty">Loading users...</td></tr>}
          </tbody>
        </table>
      </section>

      {(modal === 'create' || modal === 'edit') && (
        <div className="users-modal-backdrop">
          <form className="users-modal" onSubmit={saveUser}>
            <div className="users-modal-head"><div><h2>{modal === 'create' ? 'Add User' : 'Edit User'}</h2><p>Assign role, store and account access.</p></div><button type="button" onClick={() => setModal(null)}><span className="material-icons">close</span></button></div>
            <div className="users-form-grid">
              <label><span>Full Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
              <label><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
              <label><span>Phone Number</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></label>
              <label><span>Role</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ApiEmployee['role'] })} disabled={!isAdmin}><option value="Employee">Employee</option>{isAdmin && <option value="Manager">Manager</option>}</select></label>
              <label><span>Assigned Store</span><select value={form.store_ref} onChange={(e) => setForm({ ...form, store_ref: e.target.value })} required><option value="">Select store</option>{visibleStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
              <label className="users-toggle"><span>Account Status</span><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><b>{form.active ? 'Active' : 'Inactive'}</b></label>
              <label><span>{modal === 'edit' ? 'New Password' : 'Password'}</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={modal === 'create'} /></label>
              <label><span>Confirm Password</span><input type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required={Boolean(form.password)} /></label>
            </div>
            {error && <p className="users-notice error">{error}</p>}
            <div className="users-modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save User'}</button></div>
          </form>
        </div>
      )}

      {modal === 'view' && selected && <div className="users-modal-backdrop"><div className="users-modal users-detail"><div className="users-modal-head"><div><h2>{selected.name}</h2><p>User profile and activity summary</p></div><button onClick={() => setModal(null)}><span className="material-icons">close</span></button></div><dl><div><dt>Email</dt><dd>{selected.email || '-'}</dd></div><div><dt>Phone</dt><dd>{selected.phone || '-'}</dd></div><div><dt>Role</dt><dd>{selected.role}</dd></div><div><dt>Store</dt><dd>{selected.store || '-'}</dd></div><div><dt>Status</dt><dd>{selected.active === false ? 'Inactive' : 'Active'}</dd></div><div><dt>Join Date</dt><dd>{selected.join_date ? new Date(selected.join_date).toLocaleDateString() : '-'}</dd></div><div><dt>Last Login</dt><dd>{selected.last_login ? new Date(selected.last_login).toLocaleString() : '-'}</dd></div><div><dt>Sales / Activity</dt><dd>{selected.sales_count}</dd></div></dl></div></div>}

      {modal === 'delete' && selected && <div className="users-modal-backdrop"><div className="users-modal users-delete"><div className="users-modal-head"><div><h2>Delete User</h2><p>This permanently removes access for {selected.name}.</p></div></div>{error && <p className="users-notice error">{error}</p>}<div className="users-modal-actions"><button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-danger" disabled={saving} onClick={() => void confirmDelete()}>{saving ? 'Deleting...' : 'Delete User'}</button></div></div></div>}
    </div>
  );
};

export default Employees;
