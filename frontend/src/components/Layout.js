// frontend/src/components/Layout.js
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="sidebar-logo">
          <span className="logo-icon">🎬</span>
          ClipFlow
        </NavLink>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">📊</span>
            Dashboard
          </NavLink>

          <NavLink
            to="/upload"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">⬆️</span>
            Upload & Post
          </NavLink>

          <NavLink
            to="/accounts"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">🔗</span>
            Connected Accounts
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="user-chip">
            <div className="user-avatar">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <span className="user-email">{user?.email}</span>
            <button className="logout-btn" onClick={handleLogout} title="Sign out">
              ↩
            </button>
          </div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
