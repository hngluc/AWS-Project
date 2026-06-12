import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../ui/Button';
import { Mail, ArrowLeft, RefreshCw } from 'lucide-react';

export const SignupForm = ({ onToggleMode }) => {
  const signUp = useAuthStore((state) => state.signUp);
  const confirmSignUp = useAuthStore((state) => state.confirmSignUp);
  const resendConfirmationCode = useAuthStore((state) => state.resendConfirmationCode);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // 'register' = signup form, 'verify' = OTP code input, 'done' = success
  const [step, setStep] = useState('register');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalLoading(true);
    setLocalError(null);
    setSuccessMsg(null);
    clearError();

    if (password !== confirmPassword) {
      setLocalError('Mật khẩu xác nhận không khớp');
      setLocalLoading(false);
      return;
    }

    try {
      const result = await signUp(email, password, name);
      if (result.userConfirmed) {
        // Auto-confirmed (demo mode or admin-created)
        setStep('done');
        setSuccessMsg('Đăng ký thành công! Bạn có thể đăng nhập ngay.');
      } else {
        // Cognito sent a verification code to the email
        setStep('verify');
      }
    } catch (err) {
      setLocalError(err.message || 'Đăng ký thất bại. Vui lòng thử lại.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLocalLoading(true);
    setLocalError(null);
    clearError();

    try {
      await confirmSignUp(email, verificationCode.trim());
      setStep('done');
      setSuccessMsg('Xác thực email thành công! Bạn có thể đăng nhập ngay.');
    } catch (err) {
      const msg = err.message || 'Mã xác nhận không đúng.';
      setLocalError(msg);
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
      // Start 60-second cooldown
      setResendCooldown(60);
      const timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setLocalError(err.message || 'Không thể gửi lại mã. Vui lòng thử lại.');
    }
  };

  const renderError = () => {
    const displayError = localError || error;
    if (!displayError) return null;
    return (
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
        {displayError}
      </div>
    );
  };

  const renderSuccess = () => {
    if (!successMsg) return null;
    return (
      <div
        style={{
          background: 'var(--success-light)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.75rem 1rem',
          color: '#34d399',
          fontSize: '0.85rem',
          marginBottom: '1.5rem',
          textAlign: 'left',
        }}
      >
        {successMsg}
      </div>
    );
  };

  // ─── Step: Verify OTP Code ─────────────────────────────────────
  if (step === 'verify') {
    return (
      <div className="glass-card" style={{ maxWidth: '420px', width: '100%', margin: 'auto' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--primary-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
          Chúng tôi đã gửi mã xác nhận gồm 6 chữ số đến{' '}
          <strong style={{ color: 'var(--primary)' }}>{email}</strong>.
          Vui lòng kiểm tra email (và cả thư mục Spam) rồi nhập mã bên dưới.
        </p>

        {renderSuccess()}
        {renderError()}

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
            Xác nhận
          </Button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <button
            type="button"
            onClick={() => { setStep('register'); setLocalError(null); setSuccessMsg(null); clearError(); }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <ArrowLeft size={14} /> Quay lại
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            style={{
              background: 'none',
              border: 'none',
              color: resendCooldown > 0 ? 'var(--text-muted)' : 'var(--primary)',
              cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <RefreshCw size={14} />
            {resendCooldown > 0 ? `Gửi lại (${resendCooldown}s)` : 'Gửi lại mã'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: Done ────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="glass-card" style={{ maxWidth: '420px', width: '100%', margin: 'auto', textAlign: 'center' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(16, 185, 129, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem',
            color: '#34d399',
            fontSize: '2rem',
          }}
        >
          ✓
        </div>
        <h2 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Đăng ký thành công!</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>
          Tài khoản của bạn đã được xác thực. Bạn có thể đăng nhập ngay bây giờ.
        </p>

        <Button
          variant="primary"
          style={{ width: '100%' }}
          onClick={onToggleMode}
        >
          Đăng nhập ngay
        </Button>
      </div>
    );
  }

  // ─── Step: Register ────────────────────────────────────────────
  return (
    <div className="glass-card" style={{ maxWidth: '420px', width: '100%', margin: 'auto' }}>
      <h2 style={{ marginBottom: '0.5rem', textAlign: 'center', fontSize: '1.75rem' }}>
        Tạo tài khoản
      </h2>
      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>
        Đăng ký để sử dụng kho ảnh thông minh trên nền tảng đám mây.
      </p>

      {renderSuccess()}
      {renderError()}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Họ và tên</label>
          <input
            type="text"
            required
            className="form-input"
            placeholder="Nguyễn Văn A"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

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

        <div className="form-group">
          <label className="form-label">Mật khẩu</label>
          <input
            type="password"
            required
            className="form-input"
            placeholder="Tối thiểu 8 ký tự (gồm hoa, thường, số, đặc biệt)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label className="form-label">Xác nhận mật khẩu</label>
          <input
            type="password"
            required
            className="form-input"
            placeholder="Nhập lại mật khẩu"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          style={{ width: '100%', marginBottom: '1rem' }}
          loading={localLoading}
        >
          Đăng ký
        </Button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        Đã có tài khoản?{' '}
        <span
          onClick={onToggleMode}
          style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}
        >
          Đăng nhập
        </span>
      </div>
    </div>
  );
};
