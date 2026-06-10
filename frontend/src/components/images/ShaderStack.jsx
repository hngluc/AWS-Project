import { useState } from 'react';
import { ShaderControlItem } from './ShaderControlItem';
import { AVAILABLE_EFFECTS } from '../../pipeline/shaders';

export function ShaderStack({
  activeEffects,
  onReorder,
  onToggle,
  onRemove,
  onParamChange,
  onMove,
  onAdd,
  onApplyRecipe,
  recipes,
  maxEffects,
  notice,
  isContinuous,
}) {
  // Local state to track which card is currently being dragged
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [effectSearch, setEffectSearch] = useState('');
  const normalizedSearch = effectSearch.trim().toLowerCase();
  const filteredEffects = Object.values(AVAILABLE_EFFECTS).filter((effect) =>
    `${effect.name} ${effect.description ?? ''}`.toLowerCase().includes(normalizedSearch)
  );

  const handleDragStart = (event, index) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', activeEffects[index].id);
    setDraggedIndex(index);
  };

  const handleDragOver = (overIndex) => {
    if (draggedIndex === null || draggedIndex === overIndex) return;

    // Swap activeEffects array items in state dynamically during hover
    const updated = [...activeEffects];
    const temp = updated[draggedIndex];
    updated[draggedIndex] = updated[overIndex];
    updated[overIndex] = temp;

    onReorder(updated);
    setDraggedIndex(overIndex); // Shift the dragged index tracker to match
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <aside className="sidebar-section">
      {/* Sidebar Header with Selection Dropdown */}
      <div className="sidebar-header">
        <div className="stack-title-row">
          <h2>Shader Stack</h2>
          <span className="stack-limit-badge">
            {activeEffects.length}/{maxEffects}
          </span>
        </div>
        <div className="add-filter-selector">
          <div className="effect-search-shell">
            <span className="effect-search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              value={effectSearch}
              onChange={(event) => setEffectSearch(event.target.value)}
              className="effect-search-input"
              placeholder="Search effects..."
              aria-label="Search effects"
            />
          </div>
          <select
            onChange={(e) => {
              if (e.target.value) {
                onAdd(e.target.value);
                e.target.value = ''; // Reset select node selection
              }
            }}
            defaultValue=""
            className="select-dropdown"
            disabled={activeEffects.length >= maxEffects}
          >
            <option value="" disabled>
              {activeEffects.length >= maxEffects
                ? `Maximum ${maxEffects} effects reached`
                : '+ Add Effect Filter'}
            </option>
            {filteredEffects.map((def) => {
              const isAlreadyActive = activeEffects.some(effect => effect.type === def.id);
              return (
                <option key={def.id} value={def.id} disabled={isAlreadyActive}>
                  {def.name}{isAlreadyActive ? ' (Added)' : ''}
                </option>
              );
            })}
            {filteredEffects.length === 0 && (
              <option value="" disabled>No matching effects</option>
            )}
          </select>
        </div>
        <div className="recipe-section">
          <span className="recipe-label">Quick recipes</span>
          <div className="recipe-buttons">
            {recipes.map(recipe => (
              <button
                key={recipe.name}
                type="button"
                className="recipe-button"
                onClick={() => onApplyRecipe(recipe)}
              >
                {recipe.name}
              </button>
            ))}
          </div>
        </div>
        {notice && <p className="stack-notice" role="status">{notice}</p>}
      </div>

      {/* Render Active Shader Cards */}
      <div className="effects-stack-container">
        {activeEffects.length === 0 ? (
          <div className="empty-stack-message">
            <p>No filters active. Add a filter to modify the media feed.</p>
          </div>
        ) : (
          activeEffects.map((effect, index) => (
            <ShaderControlItem
              key={effect.id}
              effect={effect}
              index={index}
              isFirst={index === 0}
              isLast={index === activeEffects.length - 1}
              onToggle={onToggle}
              onRemove={onRemove}
              onParamChange={onParamChange}
              onMove={onMove}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              isDragging={draggedIndex === index}
            />
          ))
        )}
      </div>

      {/* Footer detailing status and optimization info */}
      <div className="sidebar-footer">
        <div
          className="fps-counter-badge"
          style={{
            color: isContinuous ? 'var(--success)' : 'var(--text-muted)',
            backgroundColor: isContinuous
              ? 'rgba(34, 197, 94, 0.1)'
              : 'rgba(255, 255, 255, 0.02)',
            borderColor: isContinuous
              ? 'rgba(34, 197, 94, 0.2)'
              : 'rgba(255, 255, 255, 0.05)',
          }}
        >
          <span
            className="pulse-dot"
            style={{
              backgroundColor: isContinuous ? 'var(--success)' : 'var(--text-muted)',
              animation: isContinuous ? 'pulse-green 1.5s infinite' : 'none',
            }}
          ></span>
          {isContinuous ? '60 FPS Active' : 'Static (Idle)'}
        </div>
        <p className="pipeline-tip">
          Drag and drop filter cards to adjust rendering order on-the-fly.
        </p>
      </div>
    </aside>
  );
}
