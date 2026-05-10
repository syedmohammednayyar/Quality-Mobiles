import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './views/Dashboard';
import Sales from './views/Sales';
import Repairs from './views/Repairs';
import Accessories from './views/Accessories';
import Inventory from './views/Inventory';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './views/Login';
import { User, isPrivilegedUser, isSalesUser } from './types';
import POS from './views/POS';
import Buyback from './views/Buyback';
import Employees from './views/Employees';
import Customers from './views/Customers';
import Reports from './views/Reports';
import { ApiStore, clearAuthToken, clearSessionUser, getAuthToken, getCurrentUser, getSessionUser, listStores, logout as apiLogout, setSessionUser } from './services/api';

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(() => getSessionUser() as User | null);
  const [currentStore, setCurrentStore] = useState<ApiStore | { id: string, name: string }>({ id: 'all', name: 'All Stores' });
  const [stores, setStores] = useState<ApiStore[]>([]);

  const refreshStores = async () => {
    try {
      const data = await listStores();
      setStores(data);
    } catch (err) {
      console.error('Failed to refresh stores:', err);
    }
  };

  useEffect(() => {
    if (user) {
      void refreshStores();
    }
  }, [user]);

  // Load theme preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    if (user && !getAuthToken()) {
      clearSessionUser();
      setUser(null);
    }
  }, [user]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token || user) return;

    const hydrateUser = async () => {
      try {
        const current = await getCurrentUser();
        setSessionUser(current);
        setUser(current as User);
      } catch {
        clearAuthToken();
        clearSessionUser();
        setUser(null);
      }
    };

    void hydrateUser();
  }, [user]);

  const handleLogin = (loggedInUser: User) => {
    setSessionUser(loggedInUser);
    setUser(loggedInUser);
  };

  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch {
      // Ignore logout API failures; local session should still clear.
    }
    clearAuthToken();
    clearSessionUser();
    setUser(null);
  };

  const handleStoreChange = (store: ApiStore | { id: string, name: string }) => {
    setCurrentStore(store);
  };

  const privileged = isPrivilegedUser(user);
  const salesUser = isSalesUser(user);
  const adminOrManager = user?.role === 'Admin' || user?.role === 'Manager';
  const adminOnly = user?.role === 'Admin';
  const defaultPath = privileged ? '/dashboard' : '/pos';

  return (
    <Router>
      {!user ? (
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      ) : (
        <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
          <Header 
            onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            user={user}
            currentStore={currentStore}
            stores={stores}
            onStoreChange={handleStoreChange}
            onLogout={handleLogout}
          />
          
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Sidebar 
              isOpen={isSidebarOpen} 
              setIsOpen={setIsSidebarOpen} 
              user={user}
              onLogout={handleLogout}
            />
            
            <main
              style={{
                flex: 1,
                overflow: 'auto',
                background:
                  'radial-gradient(circle at 0% 0%, rgba(139, 192, 224, 0.32), transparent 34%), radial-gradient(circle at 100% 0%, rgba(94, 231, 223, 0.26), transparent 30%), var(--bg-secondary)',
                padding: '24px',
              }}
            >
              <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
                <Routes>
                  <Route path="/dashboard" element={privileged ? <Dashboard user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/sales" element={salesUser ? <Sales user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/pos" element={salesUser ? <POS user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/buyback" element={adminOrManager ? <Buyback user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/inventory" element={privileged ? <Inventory user={user} stores={stores} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/repairs" element={adminOrManager ? <Repairs user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/accessories" element={salesUser ? <Accessories /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/financial" element={<Navigate to="/reports" replace />} />
                  <Route path="/reports" element={privileged ? <Reports user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/customers" element={salesUser || privileged ? <Customers user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/employees" element={adminOnly ? <Employees user={user} stores={stores} onStoresUpdate={refreshStores} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/" element={<Navigate to={defaultPath} replace />} />
                  <Route path="/login" element={<Navigate to={defaultPath} replace />} />
                </Routes>
              </div>
            </main>
          </div>
        </div>
      )}
    </Router>
  );
};

export default App;
