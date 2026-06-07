

/**
 * Button – primary interactive element with multiple visual variants,
 * loading state, icon support, and accessibility attributes.
 *
 * @param {'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'} variant
 * @param {'sm' | 'md' | 'lg'} size
 * @param {boolean} loading - Shows spinner and disables interaction
 * @param {React.ReactNode} icon - Optional icon element before label
 * @param {string} [ariaLabel] - Accessible label for icon-only buttons
 */
export const Button = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  icon = null,
  ariaLabel,
  ...props
}) => {
  const variantClass = `btn-${variant}`;
  const sizeClass = size !== 'md' ? `btn-${size}` : '';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      aria-disabled={disabled || loading || undefined}
      {...props}
    >
      {loading ? (
        <svg
          className="animate-spin"
          style={{
            marginLeft: '-0.25rem',
            marginRight: '0.5rem',
            height: '1rem',
            width: '1rem',
            color: 'currentColor',
          }}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            cx="12" cy="12" r="10"
            stroke="currentColor" strokeWidth="4"
            style={{ opacity: 0.25 }}
          />
          <path
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            style={{ opacity: 0.75 }}
          />
        </svg>
      ) : icon ? (
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children && <span>{children}</span>}
    </button>
  );
};
