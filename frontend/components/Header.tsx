import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Store, User } from '../types';
import { type ApiStore } from '../services/api';
import LogoShield from './LogoShield';
import './Header.css';

interface HeaderProps {
  onMenuClick: () => void;
  user: User;
  currentStore?: Store | ApiStore;
  stores?: ApiStore[];
  onStoreChange?: (store: ApiStore | { id: string, name: string }) => void;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({
  onMenuClick,
  user,
  currentStore,
  stores = [],
  onStoreChange,
  onLogout,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showStoreMenu, setShowStoreMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
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

  const selectedStoreName = searchParams.get('store') || currentStore?.name || 'All Stores';

  const selectStore = (store: ApiStore | { id: string, name: string }) => {
    const params = new URLSearchParams(searchParams);
    if (store.name === 'All Stores') params.delete('store');
    else params.set('store', store.name);
    setSearchParams(params, { replace: true });
    onStoreChange?.(store);
    setShowStoreMenu(false);
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
            <button className="store-switcher" onClick={() => setShowStoreMenu(!showStoreMenu)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              <span>{selectedStoreName}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {showStoreMenu && (
              <div className="dropdown-menu store-menu">
                <button
                  className={`dropdown-item ${selectedStoreName === 'All Stores' ? 'active' : ''}`}
                  onClick={() => selectStore({ id: 'all', name: 'All Stores' })}
                >
                  <span className="store-icon">A</span>
                  <span>All Stores</span>
                </button>
                {stores.map((store) => (
                  <button
                    key={store.id}
                    className={`dropdown-item ${selectedStoreName === store.name ? 'active' : ''}`}
                    onClick={() => selectStore(store)}
                  >
                    <span className="store-icon">{store.store_type === 'main' ? 'M' : 'S'}</span>
                    <span>{store.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="header-icon-btn" onClick={toggleDarkMode} title={isDarkMode ? 'Light Mode' : 'Dark Mode'}>
            {isDarkMode ? 'L' : 'D'}
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
