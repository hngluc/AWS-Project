import { useState } from 'react';
import { useImageStore } from '../../store/imageStore';
import { useAuthStore } from '../../store/authStore';
import { apiService } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from '../../hooks/useTranslation';
import { 
  Camera, 
  Tag as TagIcon, 
  Trash2, 
  Download, 
  ShieldAlert, 
  Calendar, 
  FileImage,
  Globe,
  Lock,
  Edit2
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ImageEditor } from './ImageEditor';

/**
 * ImageDetail – responsive image detail panel shown inside a Modal.
 * Desktop: 2-column grid (image preview | metadata).
 * Mobile: stacked 1-column layout.
 *
 * Uses toast notifications instead of alert() for all user feedback.
 *
 * @param {Object} image - Full image data object
 * @param {Function} onClose - Close the detail modal
 */
export const ImageDetail = ({ image, onClose }) => {
  const deleteImage = useImageStore((state) => state.deleteImage);
  const updateImageMetadata = useImageStore((state) => state.updateImageMetadata);
  const currentUser = useAuthStore((state) => state.user);
  const toast = useToast();

  const { 
    imageId, 
    originalFilename, 
    resizedUrl, 
    fileSize, 
    createdAt, 
    status, 
    visibility, 
    moderationStatus, 
    aiTags, 
    exifData,
    moderationLabels
  } = image;

  const { t } = useTranslation();

  const [loadingAction, setLoadingAction] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const isOwner = currentUser?.userId === image.userId || currentUser?.role === 'admin';

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleToggleVisibility = async () => {
    setLoadingAction(true);
    const newVisibility = visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    try {
      await updateImageMetadata(imageId, { visibility: newVisibility });
      toast.success(
        `Image is now ${newVisibility.toLowerCase()}.`,
        'Visibility Updated'
      );
    } catch (err) {
      toast.error(err.message || 'Failed to update visibility.', 'Update Failed');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDelete = async () => {
    setLoadingAction(true);
    try {
      await deleteImage(imageId);
      toast.success(t('toast.deleteSuccessMsg'), t('toast.deleteSuccessTitle'));
      onClose();
    } catch (err) {
      toast.error(err.message || t('toast.deleteFailMsg'), t('toast.deleteFailTitle'));
    } finally {
      setLoadingAction(false);
      setConfirmDelete(false);
    }
  };

  const handleDownload = async () => {
    try {
      const { downloadUrl } = await apiService.getDownloadUrl(imageId);
      
      try {
        // Fetch the file to bypass cross-origin "open in new tab" behavior
        const response = await fetch(downloadUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = originalFilename || `image_${imageId}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        window.URL.revokeObjectURL(blobUrl);
      } catch (e) {
        // Fallback if fetch fails (e.g. CORS issue)
        window.open(downloadUrl, '_blank');
      }
      
      toast.success(t('toast.downloadSuccessMsg') || 'Image download started...', t('toast.downloadSuccessTitle') || 'Downloading');
    } catch (err) {
      toast.error(err.message || 'Failed to get download URL.', 'Download Failed');
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: '2rem',
        color: 'var(--text-primary)',
        textAlign: 'left',
      }}
      className="image-detail-grid"
    >
      
      {/* Column 1: Image Preview */}
      <div 
        style={{ 
          background: 'var(--bg-main)', 
          borderRadius: 'var(--radius-md)', 
          overflow: 'hidden', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          maxHeight: '500px',
          border: '1px solid var(--border-color)',
          position: 'relative'
        }}
      >
        <img 
          src={resizedUrl} 
          alt={originalFilename} 
          style={{ width: '100%', height: '100%', objectFit: 'contain', maxHeight: '500px' }} 
        />
        
        {moderationStatus === 'FLAGGED' && (
          <div 
            style={{ 
              position: 'absolute', 
              inset: 0, 
              background: 'rgba(239, 68, 68, 0.45)', 
              backdropFilter: 'blur(10px)',
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '1.5rem',
              textAlign: 'center'
            }}
          >
            <ShieldAlert size={42} style={{ color: '#fff', marginBottom: '1rem' }} aria-hidden="true" />
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800' }}>{t('detail.flaggedTitle')}</h3>
            <p style={{ fontSize: '0.85rem', color: '#fca5a5', maxWidth: '300px', marginTop: '0.5rem' }}>
              {t('detail.flaggedMsg')}
            </p>
          </div>
        )}
      </div>

      {/* Column 2: Metadata & Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
        
        {/* Title and Visibility */}
        <div>
          <h2 style={{
            fontSize: 'clamp(1.15rem, 2.5vw, 1.5rem)',
            fontWeight: '800',
            marginBottom: '0.5rem',
            wordBreak: 'break-word',
          }}>
            {originalFilename}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Badge
              variant={status === 'COMPLETED' ? 'success' : 'warning'}
              ariaLabel={`Status: ${status}`}
            >
              {status}
            </Badge>
            <Badge
              variant={visibility === 'PUBLIC' ? 'primary' : 'secondary'}
              ariaLabel={`Visibility: ${visibility}`}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {visibility === 'PUBLIC' ? <Globe size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />}
                {visibility}
              </span>
            </Badge>
            {moderationStatus !== 'SAFE' && (
              <Badge variant="danger" ariaLabel={`Moderation: ${moderationStatus}`}>
                {moderationStatus}
              </Badge>
            )}
          </div>
        </div>

        {/* General Info */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          padding: '1rem',
          background: 'var(--bg-main)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <Calendar size={16} color="var(--text-muted)" aria-hidden="true" />
            <span>{t('detail.uploaded')}: {new Date(createdAt).toLocaleDateString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <FileImage size={16} color="var(--text-muted)" aria-hidden="true" />
            <span>{t('detail.size')}: {formatSize(fileSize)}</span>
          </div>
        </div>

        {/* EXIF Metadata */}
        <div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Camera size={16} aria-hidden="true" />
            {t('detail.camera')}
          </h4>
          {exifData ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.5rem',
              background: 'var(--bg-main)',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              fontSize: '0.85rem',
            }}>
              <div><strong style={{ color: 'var(--text-secondary)' }}>{t('detail.device')}:</strong> {exifData.camera || 'Unknown'}</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>{t('detail.focalLength')}:</strong> {exifData.focalLength || 'N/A'}</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>{t('detail.iso')}:</strong> {exifData.iso || 'N/A'}</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>{t('detail.location')}:</strong> {exifData.gps ? `${exifData.gps.lat.toFixed(3)}, ${exifData.gps.lng.toFixed(3)}` : 'No GPS Data'}</div>
            </div>
          ) : (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {status === 'COMPLETED' ? t('detail.noExif') : t('detail.exifProgress')}
            </span>
          )}
        </div>

        {/* AI Object Tags */}
        <div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TagIcon size={16} aria-hidden="true" />
            {t('detail.aiTags')}
          </h4>
          {aiTags && aiTags.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {aiTags.map((tag) => (
                <div 
                  key={tag.name}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-color)',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{tag.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{tag.confidence}%</span>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {status === 'COMPLETED' ? t('detail.noTags') : t('detail.analyzing')}
            </span>
          )}
        </div>

        {/* Moderation Labels (Sensitive Content) */}
        {moderationLabels && moderationLabels.length > 0 && (
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase', color: '#f87171', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert size={16} aria-hidden="true" />
              {t('detail.warnings')}
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {moderationLabels.map((lbl) => (
                <div 
                  key={lbl.name}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    color: '#f87171',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <span style={{ fontWeight: '700' }}>{lbl.name}</span>
                  <span style={{ opacity: 0.8, fontSize: '0.65rem' }}>{lbl.confidence}% Match</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Toolbar */}
        <div style={{
          display: 'flex',
          gap: '0.75rem',
          marginTop: 'auto',
          paddingTop: '1.5rem',
          borderTop: '1px solid var(--border-color)',
          flexWrap: 'wrap',
        }}>
          {isOwner && (
            <>
              <Button 
                variant="outline" 
                onClick={handleToggleVisibility} 
                loading={loadingAction}
                icon={visibility === 'PUBLIC' ? <Lock size={16} /> : <Globe size={16} />}
                ariaLabel={`Make this image ${visibility === 'PUBLIC' ? 'private' : 'public'}`}
              >
                {visibility === 'PUBLIC' ? t('detail.makePrivate') : t('detail.makePublic')}
              </Button>

              {/* Inline Delete Confirmation */}
              {confirmDelete ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'rgba(239, 68, 68, 0.08)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}>
                  <span style={{ fontSize: '0.8rem', color: '#fca5a5', fontWeight: '600' }}>{t('detail.confirmDelete')}</span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDelete}
                    loading={loadingAction}
                    ariaLabel="Confirm delete"
                  >
                    {t('detail.yes')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    ariaLabel="Cancel delete"
                  >
                    {t('detail.no')}
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="danger" 
                  onClick={() => setConfirmDelete(true)} 
                  icon={<Trash2 size={16} />}
                  ariaLabel="Delete this image"
                >
                  {t('common.delete')}
                </Button>
              )}
            </>
          )}
          <Button 
            variant="outline" 
            onClick={() => setIsEditing(true)} 
            icon={<Edit2 size={16} />}
            ariaLabel="Edit image"
          >
            {t('common.edit')}
          </Button>
          <Button 
            variant="secondary" 
            onClick={handleDownload} 
            icon={<Download size={16} />}
            style={{ marginLeft: 'auto' }}
            ariaLabel="Download original image file"
          >
            {t('common.download')}
          </Button>
        </div>

      </div>

      {/* Responsive CSS for mobile layout */}
      <style>{`
        @media (max-width: 768px) {
          .image-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {isEditing && (
        <ImageEditor image={image} onClose={() => setIsEditing(false)} />
      )}
    </div>
  );
};
