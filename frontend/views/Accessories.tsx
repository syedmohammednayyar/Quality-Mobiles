
import React, { useMemo, useState } from 'react';
import './Accessories.css';

const Accessories: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const kpis = [
    { label: 'Total Sales Today', value: '42', trend: '+12%', trendLabel: 'from yesterday', icon: 'shopping_bag', color: '#2563eb', bgLight: 'rgba(37, 99, 235, 0.12)' },
    { label: 'Top Accessory', value: 'Tempered Glass', trend: '+9%', trendLabel: 'Most sold item (24 units)', icon: 'star', color: '#8b5cf6', bgLight: 'rgba(139, 92, 246, 0.12)' },
    { label: 'Total Revenue', value: '$1,248.50', trend: '+5%', trendLabel: 'from average', icon: 'attach_money', color: '#10b981', bgLight: 'rgba(16, 185, 129, 0.12)' },
  ];

  const items = [
    { type: 'Tempered Glass', device: 'iPhone 14 Pro Max', code: 'IC-9921', cash: '$15.00', online: '$0.00', salesman: 'John D.', gift: false, image: 'https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?auto=format&fit=crop&q=80&w=100' },
    { type: 'Fast Charger 20W', device: 'USB-C Adapter', code: 'IC-4421', cash: '$0.00', online: '$25.00', salesman: 'Sarah M.', gift: true, image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&q=80&w=100' },
    { type: 'AirPods Pro Case', device: 'Silicone Blue', code: 'IC-1102', cash: '$12.00', online: '$0.00', salesman: 'Mike R.', gift: false, image: 'https://images.unsplash.com/photo-1588156979435-379b9d802b0a?auto=format&fit=crop&q=80&w=100' },
    { type: 'Lightning Cable', device: '2m Braided', code: 'IC-3392', cash: '$0.00', online: '$18.50', salesman: 'Alex M.', gift: false, image: 'https://images.unsplash.com/photo-1594914141274-b551482a3ba9?auto=format&fit=crop&q=80&w=100' },
  ];

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const query = searchTerm.toLowerCase();
    return items.filter((item) => {
      return item.type.toLowerCase().includes(query)
        || item.device.toLowerCase().includes(query)
        || item.code.toLowerCase().includes(query)
        || item.salesman.toLowerCase().includes(query);
    });
  }, [items, searchTerm]);

  return (
    <div className="accessories-page">
      <div className="card accessories-hero">
        <div>
          <h1>Accessories Sales</h1>
          <p>Manage accessory inventory and daily sales records.</p>
        </div>
        <button className="btn btn-primary accessories-add-btn">
          <span className="material-icons">add</span>
          Add Accessories Sale
        </button>
      </div>

      <div className="accessories-kpis">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="card accessories-kpi-card" style={{ borderColor: kpi.color }}>
            <div className="accessories-kpi-top">
              <div>
                <p className="accessories-kpi-label">{kpi.label}</p>
                <h3 className="accessories-kpi-value">{kpi.value}</h3>
              </div>
              <span className="accessories-kpi-icon" style={{ backgroundColor: kpi.bgLight, color: kpi.color }}>
                <span className="material-icons">{kpi.icon}</span>
              </span>
            </div>
            <p className="accessories-kpi-trend">{kpi.trend} {kpi.trendLabel}</p>
          </article>
        ))}
      </div>

      <div className="card accessories-table-wrap">
        <div className="accessories-toolbar">
          <div className="accessories-search">
            <span className="material-icons">search</span>
            <input
              type="text"
              placeholder="Search by item, code, device, or salesman..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="accessories-toolbar-actions">
            <button className="btn btn-secondary accessories-date-btn">
              <span className="material-icons">calendar_today</span>
              Today
            </button>
            <span className="accessories-count">{filteredItems.length} records</span>
          </div>
        </div>

        <div className="accessories-table-scroll">
          <table className="accessories-table">
            <thead>
              <tr>
                <th>Accessory Type</th>
                <th>IC Code</th>
                <th className="center">Gift</th>
                <th className="right">Cash</th>
                <th className="right">Online</th>
                <th>Salesman</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.code}>
                  <td>
                    <div className="accessories-item-cell">
                      <img src={item.image} alt={item.type} className="accessories-thumb" />
                      <div className="accessories-item-copy">
                        <p>{item.type}</p>
                        <span>{item.device}</span>
                      </div>
                    </div>
                  </td>
                  <td className="accessories-code">{item.code}</td>
                  <td className="center">
                    {item.gift ? <span className="material-icons accessories-gift">card_giftcard</span> : <span className="accessories-dot"></span>}
                  </td>
                  <td className="right accessories-money">{item.cash}</td>
                  <td className="right accessories-money">{item.online}</td>
                  <td>
                    <div className="accessories-salesman-cell">
                      <div className="accessories-salesman-avatar">
                        {item.salesman.split(' ').map((part) => part[0]).join('')}
                      </div>
                      <span>{item.salesman}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="accessories-empty">No matching accessory records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Accessories;
