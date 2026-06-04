import React from 'react';
import { ImageCard } from './ImageCard';
import { Image as ImageIcon } from 'lucide-react';
import { Spinner } from '../ui/Spinner';

export const ImageGrid = ({ images, onImageClick, isLoading }) => {
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
    <div className="image-grid">
      {images.map((image) => (
        <ImageCard 
          key={image.imageId} 
          image={image} 
          onClick={() => onImageClick(image)} 
        />
      ))}
    </div>
  );
};
