import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../ui/Button';
import { Mail, RefreshCw } from 'lucide-react';

export const LoginForm = ({ onToggleMode }) => {
  const login = useAuthStore((state) => state.login);
  const confirmSignUp = useAuthStore((state) => state.confirmSignUp);
  const resendConfirmationCode = useAuthStore((state) => state.resendConfirmationCode);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Verification state
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalLoading(true);
    setLocalError(null);
    setSuccessMsg(null);
    clearError();

    try {
      await login(email, password);
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      const code = err.code || err.name || '';
      if (code === 'UserNotConfirmedException' || msg.includes('not confirmed')) {
        clearError();
        setNeedsVerification(true);
        setLocalError(null);
      } else {
        setLocalError(err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại.');
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLocalLoading(true);
    setLocalError(null);
    setSuccessMsg(null);
    clearError();

    try {
      await confirmSignUp(email, verificationCode.trim());
      setSuccessMsg('Xác thực thành công! Đang đăng nhập...');
      setNeedsVerification(false);
      setVerificationCode('');

      // Auto login after verification
      setTimeout(async () => {
        try {
          await login(email, password);
        } catch (err) {
          setLocalError(err.message || 'Đăng nhập thất bại sau xác thực.');
          setSuccessMsg(null);
        }
      }, 500);
    } catch (err) {
      setLocalError(err.message || 'Mã xác nhận không đúng. Vui lòng thử lại.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLocalError(null);
    clearError();

    try {
      await resendConfirmationCode(email);
      setSuccessMsg('Đã gửi lại mã xác nhận về email của bạn.');
      setResendCooldown(60);
      const timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setLocalError(err.message || 'Không thể gửi lại mã.');
    }
  };

  // ─── Verification Screen ──────────────────────────────────────
  if (needsVerification) {
    return (
      <div className="glass-card" style={{ maxWidth: '420px', width: '100%', margin: 'auto' }}>
        <div
          style={{
            width: '64px', height: '64px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem',
            color: 'var(--primary)',
          }}
        >
          <Mail size={28} />
        </div>
        <h2 style={{ marginBottom: '0.5rem', textAlign: 'center', fontSize: '1.5rem' }}>
          Xác thực Email
        </h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>
          Tài khoản <strong style={{ color: 'var(--primary)' }}>{email}</strong> chưa được xác thực.
          Vui lòng nhập mã xác nhận 6 chữ số đã gửi về email của bạn.
        </p>

        {successMsg && (
          <div style={{
            background: 'var(--success-light)', border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem',
            color: '#34d399', fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'left',
          }}>
            {successMsg}
          </div>
        )}

        {localError && (
          <div style={{
            background: 'var(--danger-light)', border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem',
            color: '#f87171', fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'left',
          }}>
            {localError}
          </div>
        )}

        <form onSubmit={handleVerify}>
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label">Mã xác nhận</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="Nhập 6 chữ số"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength={6}
              autoFocus
              style={{
                textAlign: 'center',
                fontSize: '1.5rem',
                fontWeight: '700',
                letterSpacing: '0.5rem',
              }}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            style={{ width: '100%', marginBottom: '1rem' }}
            loading={localLoading}
          >
            Xác nhận & Đăng nhập
          </Button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <button
            type="button"
            onClick={() => { setNeedsVerification(false); setLocalError(null); setSuccessMsg(null); clearError(); }}
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            ← Quay lại
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            style={{
              background: 'none', border: 'none',
              color: resendCooldown > 0 ? 'var(--text-muted)' : 'var(--primary)',
              cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem', fontWeight: '600',
              display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}
          >
            <RefreshCw size={14} />
            {resendCooldown > 0 ? `Gửi lại (${resendCooldown}s)` : 'Gửi lại mã'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Login Screen ─────────────────────────────────────────────
  return (
    <div className="glass-card" style={{ maxWidth: '420px', width: '100%', margin: 'auto' }}>
      <h2 style={{ marginBottom: '0.5rem', textAlign: 'center', fontSize: '1.75rem' }}>
        Chào mừng trở lại
      </h2>
      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>
        Đăng nhập để quản lý kho ảnh thông minh của bạn.
      </p>

      {successMsg && (
        <div style={{
          background: 'var(--success-light)', border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem',
          color: '#34d399', fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'left',
        }}>
          {successMsg}
        </div>
      )}

      {(error || localError) && (
        <div style={{
          background: 'var(--danger-light)', border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem',
          color: '#f87171', fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'left',
        }}>
          {localError || error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Địa chỉ Email</label>
          <input
            type="email"
            required
            className="form-input"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label className="form-label">Mật khẩu</label>
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
          Đăng nhập
        </Button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        Chưa có tài khoản?{' '}
        <span
          onClick={onToggleMode}
          style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}
        >
          Đăng ký ngay
        </span>
      </div>
    </div>
  );
};
