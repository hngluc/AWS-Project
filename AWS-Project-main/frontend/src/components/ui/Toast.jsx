import { useState, useEffect } from 'react';
import { useToastStore } from '../../hooks/useToast';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ICON_MAP = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const ToastItem = ({ toast, onDismiss }) => {
  const [exiting, setExiting] = useState(false);
  const [timerWidth, setTimerWidth] = useState(100);
  const IconComponent = ICON_MAP[toast.type] || Info;

  useEffect(() => {
    if (toast.duration > 0) {
      // Animate the timer bar
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / toast.duration) * 100);
        setTimerWidth(remaining);
        if (remaining <= 0) clearInterval(interval);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [toast.duration]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 250);
  };

  return (
    <div
      className={`toast toast-${toast.type} ${exiting ? 'exiting' : ''}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <span className="toast-icon">
        <IconComponent size={20} />
      </span>

      <div className="toast-body">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        <div className="toast-message">{toast.message}</div>
      </div>

      <button
        className="toast-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>

      {/* Timer progress */}
      {toast.duration > 0 && (
        <div
          className="toast-timer"
          style={{
            width: `${timerWidth}%`,
            transitionDuration: '50ms',
          }}
        />
      )}
    </div>
  );
};

/**
 * ToastContainer – renders at root level to display global toast notifications.
 * Place once in App.jsx: <ToastContainer />
 */
export const ToastContainer = () => {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="toast-container"
      aria-label="Notifications"
      role="region"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
};
