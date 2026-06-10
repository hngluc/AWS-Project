import { useState } from 'react';
import { ImageCard } from './ImageCard';
import { SkeletonCard } from '../ui/SkeletonCard';
import { Image as ImageIcon, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * ImageGrid – responsive image gallery grid with skeleton loading,
 * staggered reveal animation, bulk selection, and empty state.
 *
 * @param {Array} images - Array of image objects to display
 * @param {Function} onImageClick - Handler when an image card is clicked
 * @param {boolean} isLoading - Whether images are currently being fetched
 * @param {Function} [onBulkDelete] - Handler for bulk delete (enables selection mode)
 */
export const ImageGrid = ({ images, onImageClick, isLoading, onBulkDelete }) => {
  const [selectedIds, setSelectedIds] = useState([]);
  const toast = useToast();
  const { t } = useTranslation();

  const handleToggleSelect = (imageId) => {
    setSelectedIds((prev) =>
      prev.includes(imageId) ? prev.filter((id) => id !== imageId) : [...prev, imageId]
    );
  };

  const handleBulkDelete = async () => {
    if (!onBulkDelete || selectedIds.length === 0) return;

    try {
      await onBulkDelete(selectedIds);
      toast.success(
        `${selectedIds.length} ${t('toast.bulkDeleteSuccessMsg')}`,
        t('toast.bulkDeleteTitle')
      );
      setSelectedIds([]);
    } catch (err) {
      toast.error(err.message || t('toast.bulkDeleteFailMsg'), t('toast.deleteFailTitle'));
    }
  };

  // Skeleton loading state
  if (isLoading && images.length === 0) {
    return (
      <div
        className="image-grid"
        role="list"
        aria-label="Loading images"
        aria-busy="true"
      >
        <SkeletonCard count={8} />
      </div>
    );
  }

  // Empty state
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
        role="status"
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(124, 58, 237, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <ImageIcon size={32} color="var(--text-muted)" />
        </div>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{t('grid.empty').split('.')[0]}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '320px', textAlign: 'center' }}>
          {t('grid.empty').split('.')[1]}
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
            animation: 'slideUp 0.2s ease-out forwards',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
          role="toolbar"
          aria-label="Bulk actions"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              {selectedIds.length} image{selectedIds.length > 1 ? 's' : ''} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
              icon={<X size={14} />}
              ariaLabel="Clear selection"
            >
              {t('grid.cancelSelect')}
            </Button>
          </div>
          {onBulkDelete && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleBulkDelete}
              icon={<Trash2 size={14} />}
              ariaLabel={`Delete ${selectedIds.length} selected images`}
            >
              {t('grid.deleteSelected')}
            </Button>
          )}
        </div>
      )}

      {/* Grid with stagger animation */}
      <div
        className="image-grid"
        role="list"
        aria-label="Image gallery"
        style={{ paddingTop: selectedIds.length > 0 ? 0 : '1.5rem' }}
      >
        {images.map((image, index) => (
          <ImageCard
            key={image.imageId}
            image={image}
            onClick={() => onImageClick(image)}
            selected={selectedIds.includes(image.imageId)}
            onSelect={onBulkDelete ? handleToggleSelect : null}
            animationDelay={index * 50}
          />
        ))}
      </div>
    </div>
  );
};
