import React, { useState } from 'react';
import { ImageCard } from './ImageCard';
import { Image as ImageIcon, Trash2, X } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/Button';

export const ImageGrid = ({ images, onImageClick, isLoading, onBulkDelete }) => {
  const [selectedIds, setSelectedIds] = useState([]);

  const handleToggleSelect = (imageId) => {
    setSelectedIds((prev) => 
      prev.includes(imageId) ? prev.filter((id) => id !== imageId) : [...prev, imageId]
    );
  };

  const handleBulkDelete = async () => {
    if (!onBulkDelete || selectedIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedIds.length} images?`)) {
      await onBulkDelete(selectedIds);
      setSelectedIds([]); // Clear selection after deletion
    }
  };
  if (isLoading && images.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div 
        className="glass-card" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '350px',
          borderStyle: 'dashed',
          borderColor: 'rgba(255,255,255,0.08)'
        }}
      >
        <ImageIcon size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>No Images Found</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Upload your first raw image to trigger the Serverless processing pipeline.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            background: 'var(--bg-surface-elevated)', 
            padding: '0.75rem 1.5rem', 
            borderRadius: 'var(--radius-md)', 
            border: '1px solid var(--primary)',
            boxShadow: 'var(--glow-shadow)',
            animation: 'slideUp 0.2s ease-out forwards'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
              {selectedIds.length} image{selectedIds.length > 1 ? 's' : ''} selected
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} icon={<X size={14} />}>
              Clear
            </Button>
          </div>
          {onBulkDelete && (
            <Button variant="danger" size="sm" onClick={handleBulkDelete} icon={<Trash2 size={14} />}>
              Delete Selected
            </Button>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="image-grid" style={{ paddingTop: selectedIds.length > 0 ? 0 : '1.5rem' }}>
        {images.map((image) => (
          <ImageCard 
            key={image.imageId} 
            image={image} 
            onClick={() => onImageClick(image)} 
            selected={selectedIds.includes(image.imageId)}
            onSelect={onBulkDelete ? handleToggleSelect : null}
          />
        ))}
      </div>
    </div>
  );
};
