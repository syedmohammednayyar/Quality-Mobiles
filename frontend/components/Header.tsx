import React, { useEffect, useRef, useState } from 'react';
import { User } from '../types';
import { updateStore, type ApiStore } from '../services/api';
import { ALL_STORES, useStoreSelection } from '../context/StoreSelectionContext';
import LogoShield from './LogoShield';
import './Header.css';

interface HeaderProps {
  onMenuClick: () => void;
  user: User;
  onStoresUpdate?: () => void | Promise<void>;
  onLogout: () => void;
  onLogoutAll: () => void;
}

const Header: React.FC<HeaderProps> = ({
  onMenuClick,
  user,
  onStoresUpdate,
  onLogout,
  onLogoutAll,
}) => {
  // The store switcher writes straight into the shared selection, which is what
  // every store-aware screen reads and sends to the API.
  const { selectedStoreId, selectedStoreName, stores, canSwitchStore, selectStore } = useStoreSelection();
  const [showStoreMenu, setShowStoreMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));

  const storeMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (storeMenuRef.current && !storeMenuRef.current.contains(e.target as Node)) setShowStoreMenu(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const syncThemeState = () => setIsDarkMode(root.classList.contains('dark'));
    syncThemeState();

    const observer = new MutationObserver(syncThemeState);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const toggleDarkMode = () => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
    setIsDarkMode(!isDarkMode);
  };

  const isAllStores = selectedStoreId === ALL_STORES;
  const assignedStoreName = stores.find((store) => String(store.id) === String(user.assignedStoreId))?.name
    || selectedStoreName
    || 'Assigned Store';

  const chooseStore = (store: ApiStore | { id: string, name: string }) => {
    selectStore({ id: String(store.id), name: store.name });
    setShowStoreMenu(false);
  };

  const openRenameModal = () => {
    if (isAllStores || !canSwitchStore) return;
    setRenameValue(selectedStoreName);
    setRenameError('');
    setShowRenameModal(true);
    setShowStoreMenu(false);
  };

  const saveRename = async () => {
    if (isAllStores || !canSwitchStore) return;
    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError('Store name is required.');
      return;
    }

    try {
      setIsRenaming(true);
      setRenameError('');
      const updated = await updateStore(selectedStoreId, { name: nextName });
      selectStore({ id: String(updated.id), name: updated.name });
      await onStoresUpdate?.();
      setShowRenameModal(false);
      setShowStoreMenu(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Failed to rename store.');
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <header className="header">
      <div className="header-container">
        <div className="header-left">
          <button className="menu-toggle" onClick={onMenuClick} title="Toggle Sidebar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          <div className="logo">
            <LogoShield size={30} />
            <span className="logo-text">QUALITY MOBILES</span>
          </div>
        </div>

        <div className="header-right">
          <div className="store-switcher-wrapper" ref={storeMenuRef}>
            <button className="store-switcher" onClick={() => canSwitchStore && setShowStoreMenu(!showStoreMenu)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              <span>{canSwitchStore ? selectedStoreName : assignedStoreName}</span>
              {canSwitchStore && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              )}
            </button>

            {canSwitchStore && showStoreMenu && (
              <div className="dropdown-menu store-menu">
                {!isAllStores && (
                  <button className="dropdown-item" onClick={openRenameModal}>
                    <span className="store-icon">R</span>
                    <span>Rename current store</span>
                  </button>
                )}
                <button
                  className={`dropdown-item ${isAllStores ? 'active' : ''}`}
                  onClick={() => chooseStore({ id: ALL_STORES, name: 'All Stores' })}
                >
                  <span className="store-icon">A</span>
                  <span>All Stores</span>
                </button>
                {stores.map((store) => (
                  <button
                    key={store.id}
                    className={`dropdown-item ${selectedStoreId === String(store.id) ? 'active' : ''}`}
                    onClick={() => chooseStore(store)}
                  >
                    <span className="store-icon">{store.store_type === 'main' ? 'M' : 'S'}</span>
                    <span>{store.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {showRenameModal && !isAllStores && canSwitchStore && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)', background: 'rgba(9, 12, 18, 0.52)', display: 'grid', placeItems: 'center', padding: 16 }}>
              <div style={{ width: 'min(460px, 100%)', borderRadius: 20, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', boxShadow: '0 30px 80px rgba(0,0,0,0.28)', overflow: 'hidden' }}>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div>
                    <h2>Rename Store</h2>
                    <p>Rename {selectedStoreName} for all users and reports.</p>
                  </div>
                  <button onClick={() => setShowRenameModal(false)}>x</button>
                </div>
                <div style={{ padding: 20, display: 'grid', gap: 14 }}>
                  <input className="inline-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} placeholder="Store name" autoFocus />
                  {renameError && <div className="pos-alert error" style={{ margin: 0 }}>{renameError}</div>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={() => setShowRenameModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={() => void saveRename()} disabled={isRenaming}>{isRenaming ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            className="header-icon-btn"
            onClick={toggleDarkMode}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4"></circle>
                <line x1="12" y1="2" x2="12" y2="5"></line>
                <line x1="12" y1="19" x2="12" y2="22"></line>
                <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"></line>
                <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"></line>
                <line x1="2" y1="12" x2="5" y2="12"></line>
                <line x1="19" y1="12" x2="22" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"></line>
                <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"></path>
              </svg>
            )}
          </button>

          <div className="user-menu-wrapper" ref={userMenuRef}>
            <button className="user-profile" onClick={() => setShowUserMenu(!showUserMenu)} title={user.name}>
              <div className="avatar"><span>{user.name.charAt(0)}</span></div>
              <div className="user-info">
                <span className="user-name">{user.name}</span>
                <span className="user-role">{user.role}</span>
              </div>
            </button>

            {showUserMenu && (
              <div className="dropdown-menu user-menu">
                <button className="dropdown-item" onClick={() => { setShowUserMenu(false); onLogoutAll(); }}>
                  <span>Logout from all devices</span>
                </button>
                <button className="dropdown-item text-error" onClick={() => { setShowUserMenu(false); onLogout(); }}>
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
