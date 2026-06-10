
import { useAuthStore } from '../../store/authStore';
import { 
  Image as ImageIcon, 
  UploadCloud, 
  Search, 
  ShieldAlert, 
  LogOut,
  User,
  Globe
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * Sidebar – main navigation panel.
 * Receives isOpen/onClose props from Layout for mobile responsive toggle.
 *
 * @param {string} activeTab - Currently active navigation tab
 * @param {Function} onTabChange - Tab change handler
 * @param {boolean} isOpen - Whether sidebar is visible on mobile
 * @param {Function} onClose - Close handler for mobile overlay
 */
export const Sidebar = ({ activeTab, onTabChange, isOpen = false }) => {
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { t } = useTranslation();

  const menuItems = [
    { id: 'gallery', label: t('nav.gallery'), icon: <ImageIcon size={20} /> },
    { id: 'community', label: t('nav.community'), icon: <Globe size={20} /> },
    { id: 'upload', label: t('nav.upload'), icon: <UploadCloud size={20} /> },
    { id: 'search', label: t('nav.search'), icon: <Search size={20} /> },
  ];

  if (isAdmin) {
    menuItems.push({ 
      id: 'moderation', 
      label: t('nav.admin'), 
      icon: <ShieldAlert size={20} /> 
    });
  }

  return (
    <aside
      id="main-sidebar"
      className={`sidebar ${isOpen ? 'active' : ''}`}
      aria-label="Main navigation"
    >
      {/* Brand Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem' }}>
        <img 
          src="/logo.png" 
          alt="" 
          aria-hidden="true"
          style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: 'var(--radius-md)', 
            boxShadow: 'var(--glow-shadow)', 
            objectFit: 'cover' 
          }} 
        />
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.02em', margin: 0 }}>
            SmartImage
          </h1>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Serverless Vault
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <nav
        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}
        role="navigation"
        aria-label="Primary"
      >
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              role="menuitem"
              aria-current={isActive ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem 1.15rem',
                borderRadius: 'var(--radius-md)',
                background: isActive 
                  ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%)' 
                  : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                fontFamily: 'var(--font-family)',
                fontWeight: isActive ? '700' : '500',
                transition: 'all 0.2s',
                borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <span 
                style={{ color: isActive ? 'var(--primary)' : 'inherit', display: 'flex', alignItems: 'center' }}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span style={{ fontSize: '0.9rem' }}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
