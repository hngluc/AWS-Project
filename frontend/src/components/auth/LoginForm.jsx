import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../ui/Button';

export const LoginForm = ({ onToggleMode }) => {
  const login = useAuthStore((state) => state.login);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalLoading(true);
    setLocalError(null);
    clearError();

    try {
      await login(email, password);
    } catch (err) {
      setLocalError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLocalLoading(false);
    }
  };

  const loadDemoAccount = (role) => {
    if (role === 'admin') {
      setEmail('admin@example.com');
      setPassword('Password123!');
    } else {
      setEmail('user@example.com');
      setPassword('Password123!');
    }
  };

  return (
    <div className="glass-card" style={{ maxWidth: '420px', width: '100%', margin: 'auto' }}>
      <h2 style={{ marginBottom: '0.5rem', textAlign: 'center', fontSize: '1.75rem' }}>
        Welcome Back
      </h2>
      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>
        Login to manage your intelligent image vault.
      </p>

      {(error || localError) && (
        <div
          style={{
            background: 'var(--danger-light)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1rem',
            color: '#f87171',
            fontSize: '0.85rem',
            marginBottom: '1.5rem',
            textAlign: 'left',
          }}
        >
          {localError || error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input
            type="email"
            required
            className="form-input"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label className="form-label">Password</label>
          <input
            type="password"
            required
            className="form-input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          style={{ width: '100%', marginBottom: '1rem' }}
          loading={localLoading}
        >
          Sign In
        </Button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        Don't have an account?{' '}
        <span
          onClick={onToggleMode}
          style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}
        >
          Sign Up
        </span>
      </div>

      {/* Demo Credentials Quick Injector */}
      <div
        style={{
          marginTop: '2rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.75rem' }}>
          Demo Credentials (Sandbox Mode)
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ flex: 1, fontSize: '0.75rem' }}
            onClick={() => loadDemoAccount('user')}
          >
            User Account
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ flex: 1, fontSize: '0.75rem' }}
            onClick={() => loadDemoAccount('admin')}
          >
            Admin Account
          </button>
        </div>
      </div>
    </div>
  );
};
