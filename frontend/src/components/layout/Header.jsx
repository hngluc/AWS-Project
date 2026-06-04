import React from 'react';
import { useAuthStore } from '../../store/authStore';
import { ShieldAlert, Database, Cloud } from 'lucide-react';

export const Header = ({ title }) => {
  const config = useAuthStore((state) => state.config);
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
      }}
    >
      <div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.02em' }}>
          {title}
        </h2>
      </div>

      {/* Cloud Infrastructure Status Banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
          >
            <Database size={16} />
            <span>Sandbox Mode (Local Mock)</span>
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
          >
            <Cloud size={16} />
            <span>Connected to AWS</span>
          </div>
        )}
      </div>
    </header>
  );
};
