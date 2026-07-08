import { useEffect } from 'react';
import { useImageStore } from '../../store/imageStore';
import { useToast } from '../../hooks/useToast';
import { Check, X, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';


/**
 * ModerationQueue – admin view for reviewing AI-flagged images.
 * Uses toast notifications for feedback instead of alert().
 */
export const ModerationQueue = () => {
  const fetchModerationQueue = useImageStore((state) => state.fetchModerationQueue);
  const moderationQueue = useImageStore((state) => state.moderationQueue);
  const moderateImage = useImageStore((state) => state.moderateImage);
  const isLoading = useImageStore((state) => state.isLoading);
  const toast = useToast();

  useEffect(() => {
    fetchModerationQueue();
  }, [fetchModerationQueue]);

  const handleAction = async (imageId, action, filename) => {
    try {
      await moderateImage(imageId, action);
      if (action === 'APPROVE') {
        toast.success(`"${filename}" has been approved and restored to galleries.`, 'Image Approved');
      } else {
        toast.warning(`"${filename}" has been rejected. Access is now restricted.`, 'Image Rejected');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update moderation state.', 'Moderation Failed');
    }
  };

  // Skeleton loading
  if (isLoading && moderationQueue.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="glass-card stagger-item"
            style={{
              display: 'flex',
              gap: '1.5rem',
              alignItems: 'center',
              padding: '1.25rem',
              animationDelay: `${i * 80}ms`,
            }}
          >
            <div className="skeleton" style={{ width: '120px', height: '90px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div className="skeleton-line long" />
              <div className="skeleton-line medium" />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div className="skeleton" style={{ width: '80px', height: '32px', borderRadius: 'var(--radius-sm)' }} />
              <div className="skeleton" style={{ width: '70px', height: '32px', borderRadius: 'var(--radius-sm)' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (moderationQueue.length === 0) {
    return (
      <div 
        className="glass-card" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '300px',
          borderStyle: 'dashed',
          borderColor: 'rgba(255,255,255,0.08)'
        }}
        role="status"
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(16, 185, 129, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <ShieldCheck size={32} color="var(--success)" />
        </div>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>All Clear!</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          No images currently require moderation.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      <div 
        style={{ 
          background: 'rgba(239, 68, 68, 0.05)', 
          border: '1px solid rgba(239, 68, 68, 0.15)', 
          padding: '1rem 1.5rem', 
          borderRadius: 'var(--radius-md)', 
          fontSize: '0.85rem', 
          color: '#fca5a5',
          textAlign: 'left'
        }}
        role="alert"
      >
        These images were flagged by Amazon Rekognition's content moderation safety filters. Approve them to display them in galleries, or Reject them to permanently restrict access.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {moderationQueue.map((image, index) => {
          return (
            <div 
              key={image.imageId}
              className="glass-card stagger-item"
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr auto',
                gap: '1.5rem',
                alignItems: 'center',
                padding: '1.25rem',
                animationDelay: `${index * 60}ms`,
              }}
            >
              {/* Image Preview */}
              <div 
                style={{ 
                  height: '90px', 
                  width: '120px', 
                  borderRadius: 'var(--radius-sm)', 
                  overflow: 'hidden', 
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-color)',
                  flexShrink: 0,
                }}
              >
                <img 
                  src={image.thumbnailUrl} 
                  alt={`Flagged image: ${image.originalFilename}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  loading="lazy"
                />
              </div>

              {/* Warnings details */}
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <h4 style={{ 
                  fontSize: '1rem', 
                  fontWeight: '700', 
                  marginBottom: '0.5rem', 
                  color: '#fff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {image.originalFilename}
                </h4>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {image.moderationLabels?.map((lbl) => (
                    <span 
                      key={lbl.name}
                      style={{
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.7rem',
                        color: '#f87171',
                        fontWeight: '600'
                      }}
                    >
                      {lbl.name} ({lbl.confidence}%)
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Toolbar */}
              <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
                <Button 
                  variant="primary" 
                  size="sm"
                  onClick={() => handleAction(image.imageId, 'APPROVE', image.originalFilename)} 
                  icon={<Check size={14} />}
                  style={{ background: 'var(--success)', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)' }}
                  ariaLabel={`Approve ${image.originalFilename}`}
                >
                  Approve
                </Button>
                <Button 
                  variant="danger" 
                  size="sm"
                  onClick={() => handleAction(image.imageId, 'REJECT', image.originalFilename)} 
                  icon={<X size={14} />}
                  ariaLabel={`Reject ${image.originalFilename}`}
                >
                  Reject
                </Button>
              </div>

            </div>
          );
        })}
      </div>

      {/* Responsive override */}
      <style>{`
        @media (max-width: 768px) {
          .glass-card[style*="grid-template-columns: 120px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};
