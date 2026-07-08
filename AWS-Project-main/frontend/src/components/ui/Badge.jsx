

/**
 * Badge – inline status indicator with semantic color variants.
 *
 * @param {'primary' | 'success' | 'warning' | 'danger'} variant
 * @param {string} [ariaLabel] - Accessible label for screen readers
 * @param {object} [style] - Additional inline styles (passthrough)
 */
export const Badge = ({ children, variant = 'primary', className = '', style = {}, ariaLabel }) => {
  const variantClass = {
    primary: 'badge-primary',
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
  }[variant] || 'badge-primary';

  return (
    <span
      className={`badge ${variantClass} ${className}`}
      style={style}
      aria-label={ariaLabel}
      role={ariaLabel ? 'status' : undefined}
    >
      {children}
    </span>
  );
};
