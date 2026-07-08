

/**
 * Spinner – accessible loading indicator.
 * Uses inline styles (no Tailwind) for full compatibility with the vanilla CSS design system.
 *
 * @param {'sm' | 'md' | 'lg'} size
 */
export const Spinner = ({ size = 'md', className = '' }) => {
  const sizeMap = { sm: 20, md: 32, lg: 48 };
  const px = sizeMap[size] || sizeMap.md;

  return (
    <div
      className={className}
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
      role="status"
      aria-label="Loading"
    >
      <svg
        className="animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        style={{ width: `${px}px`, height: `${px}px`, color: 'var(--primary)' }}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          style={{ opacity: 0.2 }}
        />
        <path
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          style={{ opacity: 0.85 }}
        />
      </svg>
      <span className="sr-only">Loading...</span>
    </div>
  );
};
