import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/accounting', label: 'Full Portfolio', icon: '📊' },
  { to: '/trader', label: 'Trader', icon: '📈' },
  { to: '/dividends', label: 'Dividends', icon: '💰' },
  { to: '/retirement', label: 'Retirement', icon: '🏦' },
  { to: '/tax', label: 'Tax', icon: '📋' },
  { to: '/import', label: 'Import', icon: '📥' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          ☰
        </button>
        <h1 className="app-title">Sleep Well At Night (SWAN)</h1>
        <button
          className="sidebar-toggle desktop-only"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? '→' : '←'}
        </button>
      </header>

      <div className="app-body">
        {/* Desktop Sidebar */}
        <nav
          className={`app-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}
          aria-label="Main navigation"
        >
          <ul className="nav-list">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? 'active' : ''}`
                  }
                  title={item.label}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {!sidebarCollapsed && (
                    <span className="nav-label">{item.label}</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div
            className="mobile-overlay"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <nav
          className={`mobile-nav ${mobileMenuOpen ? 'open' : ''}`}
          aria-label="Mobile navigation"
        >
          <ul className="nav-list">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? 'active' : ''}`
                  }
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main Content */}
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppShell;
