import React, { useEffect } from 'react';
import { useImageStore } from '../../store/imageStore';
import { ShieldAlert, Check, X, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

export const ModerationQueue = () => {
  const fetchModerationQueue = useImageStore((state) => state.fetchModerationQueue);
  const moderationQueue = useImageStore((state) => state.moderationQueue);
  const moderateImage = useImageStore((state) => state.moderateImage);
  const isLoading = useImageStore((state) => state.isLoading);

  useEffect(() => {
    fetchModerationQueue();
  }, [fetchModerationQueue]);

  const handleAction = async (imageId, action) => {
    try {
      await moderateImage(imageId, action);
    } catch (err) {
      alert('Failed to update moderation state: ' + err.message);
    }
  };

  if (isLoading && moderationQueue.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
        <Spinner size="lg" />
      </div>
    );
  }

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
      >
        <ShieldCheck size={48} color="var(--success)" style={{ marginBottom: '1rem' }} />
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
      >
        These images were flagged by Amazon Rekognition's content moderation safety filters. Approve them to display them in galleries, or Reject them to permanently restrict access.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {moderationQueue.map((image) => {
          return (
            <div 
              key={image.imageId}
              className="glass-card"
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr auto',
                gap: '1.5rem',
                alignItems: 'center',
                padding: '1.25rem'
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
                  border: '1px solid var(--border-color)'
                }}
              >
                <img 
                  src={image.thumbnailUrl} 
                  alt={image.originalFilename} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              </div>

              {/* Warnings details */}
              <div style={{ textAlign: 'left' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.5rem', color: '#fff' }}>
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
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Button 
                  variant="primary" 
                  size="sm"
                  onClick={() => handleAction(image.imageId, 'APPROVE')} 
                  icon={<Check size={14} />}
                  style={{ background: 'var(--success)', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)' }}
                >
                  Approve
                </Button>
                <Button 
                  variant="danger" 
                  size="sm"
                  onClick={() => handleAction(image.imageId, 'REJECT')} 
                  icon={<X size={14} />}
                >
                  Reject
                </Button>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
