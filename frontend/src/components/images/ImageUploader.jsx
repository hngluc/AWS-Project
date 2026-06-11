import { useState, useRef, useMemo } from 'react';
import { useImageStore } from '../../store/imageStore';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from '../../hooks/useTranslation';
import { UploadCloud, AlertTriangle, Loader, X, FileImage } from 'lucide-react';

/**
 * ImageUploader – enterprise-grade drag & drop upload zone with:
 * - Full WCAG compliance (ARIA roles, keyboard trigger, live announcements)
 * - File preview thumbnails for each upload task
 * - Enhanced progress bar with glow animation
 * - Per-file error messages
 * - Upload summary with toast notifications
 */
export const ImageUploader = () => {
  const uploadImage = useImageStore((state) => state.uploadImage);
  const cancelUpload = useImageStore((state) => state.cancelUpload);
  const uploadingFiles = useImageStore((state) => state.uploadingFiles);
  const toast = useToast();
  const { t } = useTranslation();

  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState([]);
  const [previewMap, setPreviewMap] = useState({}); // fileName -> dataURL
  const fileInputRef = useRef(null);
  const dropzoneRef = useRef(null);
  const statusRef = useRef(null); // aria-live region

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const MAX_SIZE = 25 * 1024 * 1024; // 25MB

  // Generate file preview thumbnails
  const generatePreview = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = async (files) => {
    const fileList = Array.from(files);
    const newErrors = [];
    let successCount = 0;
    let failCount = 0;

    for (const file of fileList) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        newErrors.push({ name: file.name, message: 'Unsupported format. Only JPEG, PNG, WEBP, and GIF.' });
        failCount++;
        continue;
      }

      if (file.size > MAX_SIZE) {
        newErrors.push({ name: file.name, message: 'File too large (max 25MB).' });
        failCount++;
        continue;
      }

      // Generate preview
      try {
        const preview = await generatePreview(file);
        setPreviewMap((prev) => ({ ...prev, [file.name]: preview }));
      } catch {
        // Preview generation is non-critical
      }

      try {
        await uploadImage(file);
        successCount++;
      } catch (err) {
        if (err.message !== 'AbortError') {
          failCount++;
        }
      }
    }

    setErrors(newErrors);

    // Show summary toast
    if (successCount > 0 && failCount === 0) {
      toast.success(
        t('toast.uploadSuccessMsg', { count: successCount }),
        t('toast.uploadSuccessTitle')
      );
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(
        t('toast.uploadPartialMsg', { success: successCount, fail: failCount }),
        t('toast.uploadPartialTitle')
      );
    } else if (failCount > 0 && successCount === 0) {
      toast.error(
        t('toast.uploadFailMsg', { fail: failCount }),
        t('toast.uploadFailTitle')
      );
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if we actually left the dropzone
    if (dropzoneRef.current && !dropzoneRef.current.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files) {
      handleFiles(e.target.files);
      // Reset input so same file can be re-selected
      e.target.value = '';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  // Derive cleaned previews from current upload state (avoids setState-in-effect)
  const previews = useMemo(() => {
    const activeNames = Object.keys(uploadingFiles);
    const cleaned = {};
    for (const name of activeNames) {
      if (previewMap[name]) cleaned[name] = previewMap[name];
    }
    return cleaned;
  }, [uploadingFiles, previewMap]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '640px', margin: '0 auto' }}>

      {/* Errors Banner */}
      {errors.length > 0 && (
        <div
          style={{
            background: 'var(--danger-light)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            textAlign: 'left',
          }}
          role="alert"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', fontWeight: '700', marginBottom: '0.5rem' }}>
            <AlertTriangle size={18} aria-hidden="true" />
            <span>Upload Errors</span>
            <button
              onClick={() => setErrors([])}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                color: '#f87171',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
              }}
              aria-label="Dismiss errors"
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {errors.map((err, i) => (
              <div key={i} style={{ fontSize: '0.8rem', color: '#fca5a5', display: 'flex', gap: '0.5rem' }}>
                <span style={{ fontWeight: '600', color: '#f87171', flexShrink: 0 }}>{err.name}:</span>
                <span>{err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drag & Drop Area */}
      <div
        ref={dropzoneRef}
        className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Upload images by drag and drop or click to browse files. Supports JPEG, PNG, WEBP, and GIF up to 25 megabytes."
      >
        <input
          type="file"
          multiple
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          accept={ALLOWED_TYPES.join(',')}
          aria-hidden="true"
          tabIndex={-1}
        />

        <div
          className="upload-icon"
          style={{
            width: '72px',
            height: '72px',
            borderRadius: 'var(--radius-full)',
            background: isDragging ? 'rgba(99, 102, 241, 0.15)' : 'var(--primary-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDragging ? 'var(--secondary)' : 'var(--primary)',
            marginBottom: '0.5rem',
            transition: 'all var(--transition-normal)',
          }}
          aria-hidden="true"
        >
          <UploadCloud size={34} />
        </div>

        <div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            {isDragging ? t('upload.dropzoneActive') : t('upload.dropzoneInactive')}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {t('upload.browse')}
          </p>
        </div>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
          {t('upload.supports')}
        </span>
      </div>

      {/* Screen-reader live region for upload status */}
      <div ref={statusRef} aria-live="polite" aria-atomic="true" className="sr-only">
        {Object.entries(uploadingFiles).map(([name, task]) => (
          <span key={name}>
            {name}: {task.status === 'UPLOADING' ? `uploading ${task.progress}%` : task.status.toLowerCase()}. {' '}
          </span>
        ))}
      </div>

      {/* Upload Tasks List */}
      {Object.keys(uploadingFiles).length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem', textAlign: 'left' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileImage size={18} aria-hidden="true" style={{ color: 'var(--primary)' }} />
            Processing Queue
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {Object.entries(uploadingFiles).map(([name, task]) => {
              const preview = previews[name];
              return (
                <div key={name} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  {/* File Preview Thumbnail */}
                  {preview ? (
                    <img
                      src={preview}
                      alt=""
                      className="file-preview-thumb"
                      aria-hidden="true"
                    />
                  ) : (
                    <div
                      className="file-preview-thumb"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      aria-hidden="true"
                    >
                      <FileImage size={20} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}

                  {/* File info + progress */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                      <span style={{
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '55%',
                      }}>
                        {name}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', flexShrink: 0 }}>
                        {task.status === 'UPLOADING' && (
                          <>
                            <Loader size={14} className="animate-spin" style={{ color: 'var(--primary)' }} aria-hidden="true" />
                            <span style={{ color: 'var(--primary)' }}>{task.progress}%</span>
                          </>
                        )}
                        {task.status === 'PROCESSING' && (
                          <>
                            <Loader size={14} className="animate-spin" style={{ color: 'var(--warning)' }} aria-hidden="true" />
                            <span style={{ color: 'var(--warning)' }}>AI Processing...</span>
                          </>
                        )}
                        {task.status === 'FAILED' && (
                          <>
                            <AlertTriangle size={14} style={{ color: 'var(--danger)' }} aria-hidden="true" />
                            <span style={{ color: 'var(--danger)' }}>Failed</span>
                          </>
                        )}
                        {task.status === 'CANCELED' && (
                          <>
                            <X size={14} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                            <span style={{ color: 'var(--text-muted)' }}>Canceled</span>
                          </>
                        )}
                        {task.status === 'UPLOADING' && (
                          <button
                            onClick={() => cancelUpload(name)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--danger)',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginLeft: '0.25rem',
                              borderRadius: '4px',
                            }}
                            aria-label={`Cancel upload for ${name}`}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </span>
                    </div>

                    {/* Enhanced Progress Bar */}
                    <div className="progress-bar-container">
                      <div
                        className={`progress-bar-fill ${
                          task.status === 'FAILED'
                            ? 'failed'
                            : task.status === 'CANCELED'
                            ? 'canceled'
                            : task.status === 'PROCESSING'
                            ? 'processing'
                            : 'uploading'
                        }`}
                        style={{ width: `${task.progress}%` }}
                        role="progressbar"
                        aria-valuenow={task.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Upload progress for ${name}`}
                      />
                    </div>

                    {/* Error message */}
                    {task.error && task.status !== 'CANCELED' && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>
                        {task.error}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
