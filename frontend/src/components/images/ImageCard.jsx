import React from 'react';
import { Eye, ShieldAlert, ShieldX, Globe, CheckSquare, Square } from 'lucide-react';
import { Badge } from '../ui/Badge';

export const ImageCard = ({ image, onClick, selected = false, onSelect = null }) => {
  const { imageId, originalFilename, thumbnailUrl, status, moderationStatus, visibility } = image;

  const isFlagged = moderationStatus === 'FLAGGED';
  const isRejected = moderationStatus === 'REJECTED';

  return (
    <div 
      className="image-card" 
      onClick={onClick}
      style={selected ? {
        borderColor: 'var(--primary)',
        borderWidth: '3px',
        transform: 'scale(0.96)',
        boxShadow: 'var(--glow-shadow)'
      } : {}}
    >
      {/* Selection Checkbox */}
      {onSelect && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onSelect(imageId);
          }}
          style={{
            position: 'absolute',
            top: '0.75rem',
            right: '0.75rem',
            zIndex: 20,
            background: selected ? 'var(--primary)' : 'rgba(0,0,0,0.5)',
            color: 'white',
            borderRadius: '4px',
            padding: '2px',
            display: 'flex',
            cursor: 'pointer',
            opacity: selected ? 1 : 0.7,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = selected ? '1' : '0.7'}
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
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Badge variant={status === 'COMPLETED' ? 'success' : status === 'FAILED' ? 'danger' : 'warning'}>
                  {status}
                </Badge>
                {visibility === 'PUBLIC' && (
                  <Badge variant="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Globe size={12} />
                    Public
                  </Badge>
                )}
              </div>
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
