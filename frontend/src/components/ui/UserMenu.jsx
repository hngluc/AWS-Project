import { useState, useRef, useEffect } from 'react';
import { Settings, LogOut, User, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from '../../hooks/useTranslation';
import { ThemeSwitcher } from './ThemeSwitcher';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Badge } from './Badge';

export const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();
  const isAdmin = user?.role === 'admin';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: '0.5rem 0.75rem',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Settings size={16} />
        <span style={{ fontSize: '0.85rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {t('nav.settings')}
          <ChevronDown size={14} style={{ opacity: 0.7 }} />
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            right: 0,
            width: '240px',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
            zIndex: 100,
            overflow: 'hidden',
            animation: 'slideDown 0.15s ease-out forwards',
          }}
          role="menu"
        >
          {/* User Info Header */}
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div 
                style={{ 
                  width: '36px', height: '36px', borderRadius: 'var(--radius-full)', 
                  background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', 
                  justifyContent: 'center', border: '1px solid var(--glass-border)', flexShrink: 0 
                }}
              >
                <User size={18} color="var(--text-secondary)" />
              </div>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {user?.name}
                  {isAdmin && <Badge variant="danger" style={{ fontSize: '0.6rem', padding: '0.1rem 0.35rem' }}>Admin</Badge>}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.email}
                </div>
              </div>
            </div>
          </div>

          {/* Settings Options */}
          <div style={{ padding: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('nav.appearance')}</span>
              <ThemeSwitcher />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('nav.language')}</span>
              <LanguageSwitcher />
            </div>
          </div>

          {/* Logout Action */}
          <div style={{ padding: '0.5rem', borderTop: '1px solid var(--glass-border)' }}>
            <button
              onClick={logout}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 0.5rem',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: '#f87171',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background 0.2s',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              role="menuitem"
            >
              <LogOut size={16} />
              {t('nav.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
