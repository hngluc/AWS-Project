import React, { useState } from 'react';
import { useImageStore } from '../../store/imageStore';
import { useAuthStore } from '../../store/authStore';
import { apiService } from '../../services/api';
import { 
  Camera, 
  Tag as TagIcon, 
  Eye, 
  Trash2, 
  Download, 
  ShieldAlert, 
  Calendar, 
  FileImage,
  Globe,
  Lock
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export const ImageDetail = ({ image, onClose }) => {
  const deleteImage = useImageStore((state) => state.deleteImage);
  const updateImageMetadata = useImageStore((state) => state.updateImageMetadata);
  const currentUser = useAuthStore((state) => state.user);

  const { 
    imageId, 
    originalFilename, 
    resizedUrl, 
    mimeType, 
    fileSize, 
    createdAt, 
    status, 
    visibility, 
    moderationStatus, 
    aiTags, 
    exifData,
    moderationLabels
  } = image;

  const [loadingAction, setLoadingAction] = useState(false);
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
    } catch (err) {
      alert('Failed to update visibility: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to permanently delete this image? This will clean up all processed files in S3.')) {
      return;
    }
    setLoadingAction(true);
    try {
      await deleteImage(imageId);
      onClose();
    } catch (err) {
      alert('Failed to delete image: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDownload = async () => {
    try {
      const { downloadUrl } = await apiService.getDownloadUrl(imageId);
      // Open in a new tab to trigger download
      window.open(downloadUrl, '_blank');
    } catch (err) {
      alert('Failed to get download URL: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', color: '#fff', textAlign: 'left' }}>
      
      {/* Column 1: Image Preview */}
      <div 
        style={{ 
          background: 'rgba(0,0,0,0.3)', 
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
            <ShieldAlert size={42} style={{ color: '#fff', marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800' }}>Flagged for Moderation</h3>
            <p style={{ fontSize: '0.85rem', color: '#fca5a5', maxWidth: '300px', marginTop: '0.5rem' }}>
              Our AI detected potentially sensitive content. Admin review pending.
            </p>
          </div>
        )}
      </div>

      {/* Column 2: Metadata & Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Title and Visibility */}
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem' }}>
            {originalFilename}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Badge variant={status === 'COMPLETED' ? 'success' : 'warning'}>
              {status}
            </Badge>
            <Badge variant={visibility === 'PUBLIC' ? 'primary' : 'secondary'}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {visibility === 'PUBLIC' ? <Globe size={12} /> : <Lock size={12} />}
                {visibility}
              </span>
            </Badge>
            {moderationStatus !== 'SAFE' && (
              <Badge variant="danger">
                {moderationStatus}
              </Badge>
            )}
          </div>
        </div>

        {/* General Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <Calendar size={16} color="var(--text-muted)" />
            <span>Uploaded: {new Date(createdAt).toLocaleDateString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <FileImage size={16} color="var(--text-muted)" />
            <span>Size: {formatSize(fileSize)}</span>
          </div>
        </div>

        {/* EXIF Metadata */}
        <div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Camera size={16} />
            Camera & Lens (EXIF)
          </h4>
          {exifData ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Device:</strong> {exifData.camera || 'Unknown'}</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Focal Length:</strong> {exifData.focalLength || 'N/A'}</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>ISO:</strong> {exifData.iso || 'N/A'}</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Location:</strong> {exifData.gps ? `${exifData.gps.lat.toFixed(3)}, ${exifData.gps.lng.toFixed(3)}` : 'No GPS Data'}</div>
            </div>
          ) : (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {status === 'COMPLETED' ? 'No EXIF metadata found in this image.' : 'EXIF extraction in progress...'}
            </span>
          )}
        </div>

        {/* AI Object Tags */}
        <div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TagIcon size={16} />
            AI Detected Objects (Amazon Rekognition)
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
              {status === 'COMPLETED' ? 'No tags detected.' : 'Analyzing image objects...'}
            </span>
          )}
        </div>

        {/* Moderation Labels (Sensitive Content) */}
        {moderationLabels && moderationLabels.length > 0 && (
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase', color: '#f87171', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert size={16} />
              AI Moderation Warnings
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
        <div style={{ display: 'flex', gap: '1rem', marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
          {isOwner && (
            <>
              <Button 
                variant="outline" 
                onClick={handleToggleVisibility} 
                loading={loadingAction}
                icon={visibility === 'PUBLIC' ? <Lock size={16} /> : <Globe size={16} />}
              >
                Make {visibility === 'PUBLIC' ? 'Private' : 'Public'}
              </Button>
              <Button 
                variant="danger" 
                onClick={handleDelete} 
                loading={loadingAction}
                icon={<Trash2 size={16} />}
              >
                Delete
              </Button>
            </>
          )}
          <Button 
            variant="secondary" 
            onClick={handleDownload} 
            icon={<Download size={16} />}
            style={{ marginLeft: 'auto' }}
          >
            Download
          </Button>
        </div>

      </div>
    </div>
  );
};
