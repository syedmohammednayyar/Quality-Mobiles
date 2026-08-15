import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './views/Dashboard';
import Sales from './views/Sales';
import Inventory from './views/Inventory';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './views/Login';
import { User } from './types';
import POS from './views/POS';
import Buyback from './views/Buyback';
import Employees from './views/Employees';
import Reports from './views/Reports';
import LossManagement from './views/LossManagement';
import { ApiStore, clearAuthToken, clearSessionUser, getAuthToken, getCurrentUser, getSessionUser, listStores, logout as apiLogout, logoutAllDevices, refreshSession, setSessionUser } from './services/api';
import { StoreSelectionProvider } from './context/StoreSelectionContext';
import './App.css';

const App: React.FC = () => {
  // Desktop: sidebar starts visible (open). Mobile/tablet: sidebar starts as a
  // closed off-canvas drawer. Same boolean, same toggle button — the CSS
  // (App.css/Sidebar.css) decides *how* "open"/"closed" looks per breakpoint.
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 1024);
  const [user, setUser] = useState<User | null>(() => getSessionUser() as User | null);
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
    const token = getAuthToken();
    if (user || !token) {
      if (!user && !token) {
        void refreshSession(true).then((renewed) => {
          if (renewed) setUser(getSessionUser() as User | null);
        });
      }
      return;
    }

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

  useEffect(() => {
    if (!user) return;
    const token = getAuthToken();
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
      const refreshIn = Math.max(5_000, Number(payload.exp || 0) * 1000 - Date.now() - 5 * 60 * 1000);
      const timer = window.setTimeout(() => void refreshSession(true), refreshIn);
      return () => window.clearTimeout(timer);
    } catch {
      return;
    }
  }, [user]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'quality-mobiles-user') {
        setUser(getSessionUser() as User | null);
      }
    };
    const onWarning = () => {
      clearAuthToken();
      clearSessionUser();
      setUser(null);
    };
    const onRenewed = () => {
      setUser(getSessionUser() as User | null);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('auth:session-warning', onWarning);
    window.addEventListener('auth:session-renewed', onRenewed);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('auth:session-warning', onWarning);
      window.removeEventListener('auth:session-renewed', onRenewed);
    };
  }, []);

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

  const handleLogoutAll = async () => {
    try {
      await logoutAllDevices();
    } finally {
      clearAuthToken();
      clearSessionUser();
      setUser(null);
    }
  };

  const isAdmin = user?.role === 'Admin';
  const isManager = user?.role === 'Manager';
  const isEmployee = user?.role === 'Employee';
  const adminOrManager = isAdmin || isManager;
  const defaultPath = isAdmin || isManager ? '/dashboard' : '/pos';

  return (
    <Router>
      {!user ? (
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      ) : (
        <StoreSelectionProvider user={user} stores={stores}>
        <div className={`app-shell${isSidebarOpen ? '' : ' sidebar-collapsed'}`}>
          <Sidebar
            isOpen={isSidebarOpen}
            setIsOpen={setIsSidebarOpen}
            user={user}
            onLogout={handleLogout}
          />

          <div className="app-area">
            <Header
              onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)}
              user={user}
              onStoresUpdate={refreshStores}
              onLogout={handleLogout}
              onLogoutAll={handleLogoutAll}
            />

            <main className="main-content">
              <div className="main-content-inner">
                <Routes>
                  <Route path="/dashboard" element={adminOrManager ? <Dashboard user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/sales" element={adminOrManager || isEmployee ? <Sales user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/pos" element={isEmployee ? <POS user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/buyback" element={adminOrManager || isEmployee ? <Buyback user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/inventory" element={adminOrManager ? <Inventory user={user} stores={stores} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/accessories" element={<Navigate to={defaultPath} replace />} />
                  <Route path="/financial" element={<Navigate to="/reports" replace />} />
                  <Route path="/reports" element={adminOrManager ? <Reports user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/losses" element={adminOrManager ? <LossManagement user={user} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/customers" element={<Navigate to={defaultPath} replace />} />
                  <Route path="/employees" element={adminOrManager ? <Employees user={user} stores={stores} onStoresUpdate={refreshStores} /> : <Navigate to={defaultPath} replace />} />
                  <Route path="/" element={<Navigate to={defaultPath} replace />} />
                  <Route path="/login" element={<Navigate to={defaultPath} replace />} />
                </Routes>
              </div>
            </main>
          </div>
        </div>
        </StoreSelectionProvider>
      )}
    </Router>
  );
};

export default App;
