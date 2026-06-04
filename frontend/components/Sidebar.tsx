import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User } from '../types';
import LogoShield from './LogoShield';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  user: User;
  onLogout: () => void;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

interface NavItem {
  label: string;
  icon: string;
  path: string;
  roles: string[];
  badge?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, user, onLogout }) => {
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState<string[]>(['section-0', 'section-1']);

  const navigationItems: NavSection[] = [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', icon: 'DB', path: '/dashboard', roles: ['Admin', 'Manager'] },
        { label: 'Reports', icon: 'RP', path: '/reports', roles: ['Admin', 'Manager'] },
      ],
    },
    {
      label: 'Operations',
      items: [
        { label: 'POS Terminal', icon: 'POS', path: '/pos', roles: ['Employee'], badge: 'Fast' },
        { label: 'Sales', icon: 'SL', path: '/sales', roles: ['Admin', 'Manager', 'Employee'] },
        { label: 'Buyback', icon: 'BB', path: '/buyback', roles: ['Admin', 'Manager', 'Employee'] },
      ],
    },
    {
      label: 'Management',
      items: [
        { label: 'Inventory', icon: 'IV', path: '/inventory', roles: ['Admin', 'Manager'] },
        { label: 'User Management', icon: 'EM', path: '/employees', roles: ['Admin', 'Manager'] },
      ],
    },
  ];

  const filteredSections = navigationItems
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(user.role)),
    }))
    .filter((section) => section.items.length > 0);

  const toggleSection = (sectionLabel: string) => {
    setExpandedSections((prev) =>
      prev.includes(sectionLabel) ? prev.filter((s) => s !== sectionLabel) : [...prev, sectionLabel]
    );
  };

  const isItemActive = (path: string) => location.pathname === path;

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />}

      <aside className={`sidebar ${isOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon brand-shield-icon">
              <LogoShield size={28} />
            </div>
            <div>
              <span className="logo-text">QUALITY MOBILES</span>
              <p className="logo-subtext">Retail Command Center</p>
            </div>
          </div>
          <button className="sidebar-close" onClick={() => setIsOpen(false)} title="Close sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          {filteredSections.map((section, idx) => {
            const sectionKey = `section-${idx}`;
            const isExpanded = expandedSections.includes(sectionKey);
            const sectionToneClass = ['tone-main', 'tone-operations', 'tone-finance', 'tone-management'][idx % 4];

            return (
              <div key={sectionKey} className={`nav-section ${sectionToneClass}`}>
                <button className="section-header" onClick={() => toggleSection(sectionKey)}>
                  <span className="section-label">{section.label}</span>
                  <span className="section-meta">
                    <span className="section-count">{section.items.length}</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`expand-icon ${isExpanded ? 'expanded' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>

                {isExpanded && (
                  <div className="nav-items">
                    {section.items.map((item, itemIdx) => {
                      const itemDelayStyle: React.CSSProperties = {
                        animationDelay: `${itemIdx * 40}ms`,
                      };

                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`nav-item ${isItemActive(item.path) ? 'active' : ''}`}
                          style={itemDelayStyle}
                        >
                          <span className="nav-icon-shell">
                            <span className="nav-icon">{item.icon}</span>
                          </span>
                          <span className="nav-label">{item.label}</span>
                          {item.badge && <span className="nav-badge">{item.badge}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">
              {user.avatar ? <img src={user.avatar} alt={user.name} /> : <span>{user.name.charAt(0)}</span>}
            </div>
            <div className="user-details">
              <p className="user-name">{user.name}</p>
              <div className="user-meta-row">
                <p className="user-role">Session Active</p>
                <span className="user-role-pill">{user.role}</span>
              </div>
            </div>
            <button
              onClick={() => {
                onLogout();
                setIsOpen(false);
              }}
              className="logout-btn"
              title="Logout"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
