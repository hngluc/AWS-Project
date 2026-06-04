import React, { useState } from 'react';
import { useImageStore } from '../../store/imageStore';
import { ImageGrid } from './ImageGrid';
import { Search, Tag } from 'lucide-react';
import { Button } from '../ui/Button';

export const ImageSearch = ({ onImageClick }) => {
  const searchByTag = useImageStore((state) => state.searchByTag);
  const searchResult = useImageStore((state) => state.searchResult);
  const activeTag = useImageStore((state) => state.activeTag);
  const isLoading = useImageStore((state) => state.isLoading);

  const [query, setQuery] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    searchByTag(query.trim());
  };

  const handleTagClick = (tag) => {
    setQuery(tag);
    searchByTag(tag);
  };

  const POPULAR_TAGS = ['Landscape', 'Mountain', 'Sunset', 'Nature', 'Coffee', 'Cat', 'Laptop', 'Office'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
      
      {/* Search Input Card */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <Search 
              size={20} 
              color="var(--text-muted)" 
              style={{ position: 'absolute', left: '1rem' }} 
            />
            <input
              type="text"
              className="form-input"
              style={{ width: '100%', paddingLeft: '2.75rem' }}
              placeholder="Search images by AI object tag (e.g. Mountain, Coffee, Landscape)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" loading={isLoading}>
            Search
          </Button>
        </form>

        {/* Suggestion tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Tag size={12} />
            Suggestions:
          </span>
          {POPULAR_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className="btn btn-sm btn-secondary"
              style={{
                fontSize: '0.7rem',
                padding: '0.25rem 0.65rem',
                borderRadius: 'var(--radius-full)',
                background: activeTag.toLowerCase() === tag.toLowerCase() ? 'rgba(124, 58, 237, 0.15)' : 'rgba(255,255,255,0.02)',
                borderColor: activeTag.toLowerCase() === tag.toLowerCase() ? 'var(--primary)' : 'var(--border-color)',
                color: activeTag.toLowerCase() === tag.toLowerCase() ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}
              onClick={() => handleTagClick(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Search Results Display */}
      {activeTag && (
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Search results for:</span>
            <span style={{ color: 'var(--primary)' }}>"{activeTag}"</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
              ({searchResult ? searchResult.length : 0} items found)
            </span>
          </h3>

          <ImageGrid 
            images={searchResult || []} 
            onImageClick={onImageClick} 
            isLoading={isLoading} 
          />
        </div>
      )}
    </div>
  );
};
