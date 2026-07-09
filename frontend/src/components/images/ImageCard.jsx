import { useState, useRef, useEffect, useCallback } from 'react';
import { Eye, ShieldAlert, ShieldX, Globe, CheckSquare, Square } from 'lucide-react';
import { Badge } from '../ui/Badge';

/**
 * ImageCard – individual image tile with lazy loading via IntersectionObserver,
 * keyboard navigation, selection checkbox, and hover overlay with metadata.
 *
 * @param {Object} image - Image data object
 * @param {Function} onClick - Click handler to open image detail
 * @param {boolean} selected - Whether this card is selected for bulk action
 * @param {Function|null} onSelect - Toggle selection handler (null disables selection)
 * @param {number} animationDelay - Stagger delay in ms for entrance animation
 */
export const ImageCard = ({ image, onClick, selected = false, onSelect = null, animationDelay = 0 }) => {
  const { imageId, originalFilename, thumbnailUrl, status, moderationStatus, visibility } = image;

  const [isVisible, setIsVisible] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const cardRef = useRef(null);

  const isFlagged = moderationStatus === 'FLAGGED';
  const isRejected = moderationStatus === 'REJECTED';

  // IntersectionObserver for lazy loading
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { rootMargin: '200px 0px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keyboard handler for accessibility
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    },
    [onClick]
  );

  const handleSelectKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect?.(imageId);
      }
    },
    [onSelect, imageId]
  );

  const cardLabel = `${originalFilename}, status: ${status}${isFlagged ? ', flagged for moderation' : ''
    }${isRejected ? ', rejected by moderator' : ''}${visibility === 'PUBLIC' ? ', public' : ''
    }`;

  return (
    <div
      ref={cardRef}
      className="image-card stagger-item"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="listitem"
      aria-label={cardLabel}
      style={{
        animationDelay: `${animationDelay}ms`,
        ...(selected
          ? {
            borderColor: 'var(--primary)',
            borderWidth: '3px',
            transform: 'scale(0.96)',
            boxShadow: 'var(--glow-shadow)',
          }
          : {}),
      }}
    >
      {/* Selection Checkbox */}
      {onSelect && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect(imageId);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            handleSelectKeyDown(e);
          }}
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${originalFilename}`}
          tabIndex={0}
          style={{
            position: 'absolute',
            top: '0.75rem',
            right: '0.75rem',
            zIndex: 20,
            background: selected ? 'var(--primary)' : 'rgba(0,0,0,0.5)',
            color: 'white',
            borderRadius: '6px',
            padding: '3px',
            display: 'flex',
            cursor: 'pointer',
            opacity: selected ? 1 : 0.7,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = selected ? '1' : '0.7')}
        >
          {selected ? <CheckSquare size={20} /> : <Square size={20} />}
        </div>
      )}

      {isRejected ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <ShieldX size={32} style={{ marginBottom: '0.5rem' }} aria-hidden="true" />
          <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>REJECTED BY MODERATOR</span>
          <span style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '0.25rem' }}>
            {originalFilename}
          </span>
        </div>
      ) : (
        <>
          {/* Lazy-loaded image with placeholder */}
          {isVisible ? (
            <>
              {/* Blur placeholder behind image */}
              {!imageLoaded && (
                <div className="image-placeholder" aria-hidden="true">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: 0.4 }}
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21,15 16,10 5,21" />
                  </svg>
                </div>
              )}
              <img
                src={thumbnailUrl}
                alt={originalFilename}
                crossOrigin="anonymous"
                loading="lazy"
                onLoad={() => setImageLoaded(true)}
                className={imageLoaded ? 'image-loaded' : ''}
                style={!imageLoaded ? { position: 'absolute', opacity: 0 } : {}}
              />
            </>
          ) : (
            <div className="image-placeholder" aria-hidden="true" />
          )}

          {/* Card Overlay on Hover / Focus */}
          <div className="image-card-overlay">
            {/* Top row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Badge
                  variant={status === 'COMPLETED' ? 'success' : status === 'FAILED' ? 'danger' : 'warning'}
                  ariaLabel={`Processing status: ${status}`}
                >
                  {status}
                </Badge>
                {visibility === 'PUBLIC' && (
                  <Badge variant="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Globe size={12} aria-hidden="true" />
                    Public
                  </Badge>
                )}
              </div>
              {isFlagged && (
                <Badge
                  variant="danger"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  ariaLabel="Flagged for moderation"
                >
                  <ShieldAlert size={12} aria-hidden="true" />
                  Flagged
                </Badge>
              )}
            </div>

            {/* Bottom row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span
                style={{
                  color: 'white',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '75%',
                }}
              >
                {originalFilename}
              </span>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                }}
                aria-hidden="true"
              >
                <Eye size={16} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
