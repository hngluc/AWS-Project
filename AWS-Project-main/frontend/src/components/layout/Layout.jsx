import { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

/**
 * Layout – main application shell with responsive sidebar toggle.
 * On mobile (≤1024px), the sidebar is hidden behind a hamburger menu
 * with an overlay backdrop.
 */
export const Layout = ({ children, activeTab, onTabChange, title, isGuest = false }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleTabChange = useCallback(
    (tab) => {
      onTabChange(tab);
      // Auto-close sidebar on mobile after navigation
      setIsSidebarOpen(false);
    },
    [onTabChange]
  );

  return (
    <div className="app-container">
      {/* Mobile overlay backdrop */}
      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`}
        onClick={handleCloseSidebar}
        aria-hidden="true"
      />

      {/* Hamburger toggle button (mobile only – hidden via CSS on desktop) */}
      <button
        className="hamburger-btn"
        onClick={handleToggleSidebar}
        aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isSidebarOpen}
        aria-controls="main-sidebar"
      >
        {isSidebarOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
        isGuest={isGuest}
      />

      {/* Main viewport */}
      <main className="main-content" role="main" aria-label="Main content">
        <Header title={title} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </main>
    </div>
  );
};
