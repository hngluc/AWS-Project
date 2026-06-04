import React from 'react';
import { Eye, ShieldAlert, ShieldX } from 'lucide-react';
import { Badge } from '../ui/Badge';

export const ImageCard = ({ image, onClick }) => {
  const { originalFilename, thumbnailUrl, status, moderationStatus } = image;

  const isFlagged = moderationStatus === 'FLAGGED';
  const isRejected = moderationStatus === 'REJECTED';

  return (
    <div className="image-card" onClick={onClick}>
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
            textAlign: 'center'
          }}
        >
          <ShieldX size={32} style={{ marginBottom: '0.5rem' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>REJECTED BY MODERATOR</span>
          <span style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '0.25rem' }}>{originalFilename}</span>
        </div>
      ) : (
        <>
          <img src={thumbnailUrl} alt={originalFilename} loading="lazy" />
          
          {/* Card Overlay on Hover */}
          <div className="image-card-overlay">
            {/* Top row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <Badge variant={status === 'COMPLETED' ? 'success' : status === 'FAILED' ? 'danger' : 'warning'}>
                {status}
              </Badge>
              {isFlagged && (
                <Badge variant="danger" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <ShieldAlert size={12} />
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
                  maxWidth: '75%'
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
                  color: 'white'
                }}
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
