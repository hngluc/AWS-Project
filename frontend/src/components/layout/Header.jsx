
import { useAuthStore } from '../../store/authStore';
import { Database, Cloud, Eye } from 'lucide-react';
import { UserMenu } from '../ui/UserMenu';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';

/**
 * Header – page title and cloud infrastructure status indicator.
 * Responsive: hides badge text on mobile, shows icon only.
 * Supports guest mode with a view-only badge instead of UserMenu.
 */
export const Header = ({ title }) => {
  const config = useAuthStore((state) => state.config);
  const isGuest = useAuthStore((state) => state.isGuest);
  const isDemo = config?.isDemo;

  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '1.25rem',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
      role="banner"
    >
      <div style={{ minWidth: 0 }}>
        <h2
          style={{
            fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
            fontWeight: '800',
            letterSpacing: '-0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h2>
      </div>

      {/* Cloud Infrastructure Status Banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        {isGuest ? (
          <>
            {/* Guest: show theme/language switchers and a guest badge */}
            <ThemeSwitcher />
            <LanguageSwitcher />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'rgba(124, 58, 237, 0.08)',
                border: '1px solid rgba(124, 58, 237, 0.2)',
                borderRadius: 'var(--radius-md)',
                padding: '0.5rem 1rem',
                color: 'var(--primary)',
                fontSize: '0.8rem',
                fontWeight: '600',
              }}
              role="status"
              aria-label="Browsing as guest - view only"
            >
              <Eye size={16} aria-hidden="true" />
              <span className="header-badge-text">Chế độ xem</span>
            </div>
          </>
        ) : (
          <UserMenu />
        )}
        
        {isDemo ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem 1rem',
              color: '#fbbf24',
              fontSize: '0.8rem',
              fontWeight: '600',
            }}
            role="status"
            aria-label="Running in sandbox mode with local mock data"
          >
            <Database size={16} aria-hidden="true" />
            <span className="header-badge-text">Sandbox Mode</span>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem 1rem',
              color: '#34d399',
              fontSize: '0.8rem',
              fontWeight: '600',
            }}
            role="status"
            aria-label="Connected to AWS cloud infrastructure"
          >
            <Cloud size={16} aria-hidden="true" />
            <span className="header-badge-text">Connected to AWS</span>
          </div>
        )}
      </div>
    </header>
  );
};
