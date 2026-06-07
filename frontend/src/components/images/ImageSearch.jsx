import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useImageStore } from '../../store/imageStore';
import { ImageGrid } from './ImageGrid';
import { Search, Tag, Clock } from 'lucide-react';
import { Button } from '../ui/Button';

const POPULAR_TAGS = ['Landscape', 'Mountain', 'Sunset', 'Nature', 'Coffee', 'Cat', 'Laptop', 'Office'];
const RECENT_SEARCHES_KEY = 'smartimage_recent_searches';
const MAX_RECENT = 5;

/**
 * ImageSearch – smart search bar with autocomplete dropdown, keyboard navigation,
 * ARIA combobox pattern, debounced input, and recent searches.
 *
 * @param {Function} onImageClick - Handler when a search result image is clicked
 */
export const ImageSearch = ({ onImageClick }) => {
  const searchByTag = useImageStore((state) => state.searchByTag);
  const searchResult = useImageStore((state) => state.searchResult);
  const activeTag = useImageStore((state) => state.activeTag);
  const isLoading = useImageStore((state) => state.isLoading);
  const images = useImageStore((state) => state.images);

  const [query, setQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);
  const resultsAnnouncerRef = useRef(null);



  // Save a search to recent history
  const saveRecentSearch = useCallback((tag) => {
    setRecentSearches((prev) => {
      const deduped = prev.filter((t) => t.toLowerCase() !== tag.toLowerCase());
      const updated = [tag, ...deduped].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Extract all unique tags from store images for autocomplete
  const allTags = useMemo(() => {
    const tagSet = new Set();
    const sources = [images, searchResult].filter(Boolean);
    for (const source of sources) {
      for (const img of source) {
        if (img.aiTags) {
          for (const t of img.aiTags) {
            tagSet.add(t.name);
          }
        }
      }
    }
    // Also include popular tags
    POPULAR_TAGS.forEach((t) => tagSet.add(t));
    return Array.from(tagSet).sort();
  }, [images, searchResult]);

  // Filter suggestions based on query
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allTags.filter((tag) => tag.toLowerCase().includes(q)).slice(0, 8);
  }, [query, allTags]);

  // Items to show in dropdown
  const dropdownItems = useMemo(() => {
    const items = [];

    if (query.trim() && suggestions.length > 0) {
      items.push({ type: 'section', label: 'Suggestions' });
      suggestions.forEach((tag) => items.push({ type: 'tag', value: tag }));
    }

    if (!query.trim() && recentSearches.length > 0) {
      items.push({ type: 'section', label: 'Recent Searches' });
      recentSearches.forEach((tag) => items.push({ type: 'recent', value: tag }));
    }

    return items;
  }, [query, suggestions, recentSearches]);

  const selectableItems = dropdownItems.filter((item) => item.type !== 'section');

  // Execute search
  const executeSearch = useCallback(
    (tag) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      setQuery(trimmed);
      setIsDropdownOpen(false);
      setActiveIndex(-1);
      saveRecentSearch(trimmed);
      searchByTag(trimmed);
    },
    [searchByTag, saveRecentSearch]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    setActiveIndex(-1);
    setIsDropdownOpen(true);

    // Debounce: no auto-search, just update suggestions immediately
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const handleInputFocus = () => {
    setIsDropdownOpen(true);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        inputRef.current &&
        !inputRef.current.contains(e.target)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isDropdownOpen || selectableItems.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsDropdownOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev < selectableItems.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : selectableItems.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < selectableItems.length) {
          executeSearch(selectableItems[activeIndex].value);
        } else {
          executeSearch(query);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsDropdownOpen(false);
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  };

  const handleTagClick = (tag) => {
    executeSearch(tag);
  };

  const handleClearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const showDropdown = isDropdownOpen && dropdownItems.length > 0;

  // Highlight matched substring
  const highlightMatch = (text, q) => {
    if (!q.trim()) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="tag-match">{text.slice(idx, idx + q.length)}</span>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>

      {/* Search Input Card */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem' }}>
          <div className="autocomplete-wrapper" ref={dropdownRef}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search
                size={20}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '1rem', pointerEvents: 'none' }}
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                className="form-input"
                style={{ width: '100%', paddingLeft: '2.75rem' }}
                placeholder="Search images by AI tag (e.g. Mountain, Coffee)..."
                value={query}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                onKeyDown={handleKeyDown}
                role="combobox"
                aria-expanded={showDropdown}
                aria-controls="search-autocomplete-list"
                aria-activedescendant={
                  activeIndex >= 0 ? `autocomplete-item-${activeIndex}` : undefined
                }
                aria-autocomplete="list"
                aria-label="Search images by AI-detected object tags"
                id="image-search-input"
              />
            </div>

            {/* Autocomplete Dropdown */}
            {showDropdown && (
              <div
                className="autocomplete-dropdown"
                id="search-autocomplete-list"
                role="listbox"
                aria-label="Search suggestions"
              >
                {dropdownItems.map((item, idx) => {
                  if (item.type === 'section') {
                    return (
                      <div key={`section-${idx}`} className="autocomplete-section-label">
                        {item.label}
                        {item.label === 'Recent Searches' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearRecent();
                            }}
                            style={{
                              float: 'right',
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: '0.6rem',
                              textTransform: 'uppercase',
                              fontWeight: '700',
                            }}
                            aria-label="Clear recent searches"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    );
                  }

                  const selectableIdx = selectableItems.indexOf(item);
                  const isActive = selectableIdx === activeIndex;

                  return (
                    <div
                      key={`${item.type}-${item.value}`}
                      id={`autocomplete-item-${selectableIdx}`}
                      className={`autocomplete-item ${isActive ? 'active' : ''}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => executeSearch(item.value)}
                      onMouseEnter={() => setActiveIndex(selectableIdx)}
                    >
                      <span className="tag-icon" aria-hidden="true">
                        {item.type === 'recent' ? <Clock size={14} /> : <Tag size={14} />}
                      </span>
                      <span>{highlightMatch(item.value, query)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            loading={isLoading}
            ariaLabel="Execute tag search"
          >
            Search
          </Button>
        </form>

        {/* Popular suggestion tags */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <Tag size={12} aria-hidden="true" />
            Popular:
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
                background:
                  activeTag.toLowerCase() === tag.toLowerCase()
                    ? 'rgba(124, 58, 237, 0.15)'
                    : 'rgba(255,255,255,0.02)',
                borderColor:
                  activeTag.toLowerCase() === tag.toLowerCase()
                    ? 'var(--primary)'
                    : 'var(--border-color)',
                color:
                  activeTag.toLowerCase() === tag.toLowerCase()
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
              }}
              onClick={() => handleTagClick(tag)}
              aria-pressed={activeTag.toLowerCase() === tag.toLowerCase()}
              aria-label={`Search for tag: ${tag}`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Search Results Display */}
      {activeTag && (
        <div>
          <h3
            style={{
              fontSize: '1.25rem',
              fontWeight: '800',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <span>Search results for:</span>
            <span style={{ color: 'var(--primary)' }}>"{activeTag}"</span>
            <span
              style={{
                fontSize: '0.9rem',
                color: 'var(--text-secondary)',
                fontWeight: 'normal',
              }}
            >
              ({searchResult ? searchResult.length : 0} items found)
            </span>
          </h3>

          {/* Screen reader announcement */}
          <div ref={resultsAnnouncerRef} aria-live="polite" className="sr-only">
            {searchResult
              ? `Found ${searchResult.length} images matching tag "${activeTag}".`
              : `Searching for "${activeTag}"...`}
          </div>

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
