import React, { useState, useRef } from 'react';
import { useImageStore } from '../../store/imageStore';
import { UploadCloud, CheckCircle, AlertTriangle, Loader, X } from 'lucide-react';
import { Button } from '../ui/Button';

export const ImageUploader = () => {
  const uploadImage = useImageStore((state) => state.uploadImage);
  const cancelUpload = useImageStore((state) => state.cancelUpload);
  const uploadingFiles = useImageStore((state) => state.uploadingFiles);
  
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState([]);
  const fileInputRef = useRef(null);

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const MAX_SIZE = 25 * 1024 * 1024; // 25MB

  const handleFiles = async (files) => {
    const fileList = Array.from(files);
    const newErrors = [];

    for (const file of fileList) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        newErrors.push(`${file.name}: Only JPEG, PNG, WEBP, and GIF images are supported.`);
        continue;
      }

      if (file.size > MAX_SIZE) {
        newErrors.push(`${file.name}: File is too large. Maximum size is 25MB.`);
        continue;
      }

      try {
        await uploadImage(file);
      } catch (err) {
        console.error('Failed to upload file', file.name, err);
      }
    }

    setErrors(newErrors);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '600px', margin: '0 auto' }}>
      
      {/* Errors Banner */}
      {errors.length > 0 && (
        <div 
          style={{ 
            background: 'var(--danger-light)', 
            border: '1px solid rgba(239,68,68,0.2)', 
            borderRadius: 'var(--radius-md)', 
            padding: '1rem',
            textAlign: 'left'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', fontWeight: '700', marginBottom: '0.5rem' }}>
            <AlertTriangle size={18} />
            <span>Upload Errors</span>
          </div>
          <ul style={{ paddingLeft: '1.25rem', color: '#f87171', fontSize: '0.85rem' }}>
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Drag & Drop Area */}
      <div
        className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          multiple
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          accept={ALLOWED_TYPES.join(',')}
        />
        
        <div 
          style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: 'var(--radius-full)', 
            background: 'var(--primary-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary)',
            marginBottom: '0.5rem'
          }}
        >
          <UploadCloud size={32} />
        </div>

        <div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            Drag & drop raw files here
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            or click to browse from device (up to 25MB)
          </p>
        </div>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
          Supports JPEG, PNG, WEBP, and GIF
        </span>
      </div>

      {/* Upload Tasks List */}
      {Object.keys(uploadingFiles).length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem', textAlign: 'left' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--text-primary)' }}>
            Processing Queue
          </h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Object.entries(uploadingFiles).map(([name, task]) => {
              return (
                <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                      {name}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700' }}>
                      {task.status === 'UPLOADING' && (
                        <>
                          <Loader size={14} className="animate-spin" style={{ color: 'var(--primary)' }} />
                          <span style={{ color: 'var(--primary)' }}>Uploading {task.progress}%</span>
                        </>
                      )}
                      {task.status === 'PROCESSING' && (
                        <>
                          <Loader size={14} className="animate-spin" style={{ color: 'var(--warning)' }} />
                          <span style={{ color: 'var(--warning)' }}>AI Analyzer / Resizing...</span>
                        </>
                      )}
                      {task.status === 'FAILED' && (
                        <>
                          <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />
                          <span style={{ color: 'var(--danger)' }}>Failed</span>
                        </>
                      )}
                      {task.status === 'CANCELED' && (
                        <>
                          <X size={14} style={{ color: 'var(--text-muted)' }} />
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
                            marginLeft: '0.5rem',
                            borderRadius: '4px'
                          }}
                          title="Cancel Upload"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </span>
                  </div>

                  {/* Progress Bar Container */}
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                    <div 
                      style={{ 
                        height: '100%', 
                        width: `${task.progress}%`, 
                        background: task.status === 'FAILED' ? 'var(--danger)' : task.status === 'CANCELED' ? 'var(--text-muted)' : task.status === 'PROCESSING' ? 'var(--warning)' : 'linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)',
                        transition: 'width 0.2s ease'
                      }}
                    />
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
