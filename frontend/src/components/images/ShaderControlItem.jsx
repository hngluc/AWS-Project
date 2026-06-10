import { AVAILABLE_EFFECTS } from '../../pipeline/shaders';

export function ShaderControlItem({
  effect,
  index,
  isFirst,
  isLast,
  onToggle,
  onRemove,
  onParamChange,
  onMove,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
}) {
  const effectDef = AVAILABLE_EFFECTS[effect.type];
  if (!effectDef) return null;

  const handleDragOver = (e) => {
    e.preventDefault(); // Required to allow drop target swapping
    onDragOver(index);
  };

  return (
    <div
      onDragOver={handleDragOver}
      className={`effect-card ${effect.enabled ? '' : 'effect-card-disabled'} ${
        isDragging ? 'effect-card-dragging' : ''
      }`}
    >
      {/* Header / Drag Anchor */}
      <div className="effect-card-header">
        <div className="effect-card-info">
          {/* Drag Handle Indicator */}
          <span
            className="drag-handle-grip"
            title="Drag to reorder"
            draggable
            onDragStart={(event) => onDragStart(event, index)}
            onDragEnd={onDragEnd}
          >
            ⋮⋮
          </span>
          
          <input
            type="checkbox"
            checked={effect.enabled}
            onChange={() => onToggle(effect.id)}
            className="effect-toggle-checkbox"
            id={`toggle-${effect.id}`}
          />
          <label htmlFor={`toggle-${effect.id}`} className="effect-name">
            {effectDef.name}
          </label>
          {effectDef.sourceUrl && (
            <a
              href={effectDef.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="shader-source-link"
              title="Open the technique reference"
              onClick={(event) => event.stopPropagation()}
            >
              source
            </a>
          )}
        </div>

        <div className="effect-card-actions">
          {/* Accessibility Up/Down buttons */}
          <button
            type="button"
            onClick={() => onMove(index, 'up')}
            disabled={isFirst}
            className="reorder-btn"
            title="Move Up"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 'down')}
            disabled={isLast}
            className="reorder-btn"
            title="Move Down"
          >
            ▼
          </button>
          <button
            type="button"
            onClick={() => onRemove(effect.id)}
            className="delete-btn"
            title="Delete Effect"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Uniform Parameters Body */}
      {effect.enabled && effectDef.uniforms.length > 0 && (
        <div className="effect-card-body">
          {effectDef.uniforms.map((uni) => {
            const currentVal =
              effect.params[uni.name] !== undefined
                ? effect.params[uni.name]
                : uni.defaultValue;
            const numericValue = typeof currentVal === 'number' ? currentVal : 0;
            const colorValue = typeof currentVal === 'string' ? currentVal : '#000000';
            const vectorValue = Array.isArray(currentVal) ? currentVal : [0, 0];

            return (
              <div key={uni.name} className="uniform-control-row">
                <label className="uniform-label">
                  <span>{uni.label || uni.name}</span>
                  <span className="uniform-value-text">
                    {uni.type === 'color'
                      ? colorValue
                      : uni.type === 'vec2'
                      ? `[${Number(vectorValue[0]).toFixed(3)}, ${Number(
                          vectorValue[1]
                        ).toFixed(3)}]`
                      : numericValue.toFixed(2)}
                  </span>
                </label>

                {/* Float Sliders */}
                {uni.type === 'float' && (
                  <input
                    type="range"
                    min={uni.min ?? 0}
                    max={uni.max ?? 1}
                    step={uni.step ?? 0.01}
                    value={numericValue}
                    onChange={(e) =>
                      onParamChange(effect.id, uni.name, parseFloat(e.target.value))
                    }
                    className="uniform-slider"
                  />
                )}

                {/* Color Swatch / Pickers */}
                {uni.type === 'color' && (
                  <div className="color-picker-wrapper">
                    <input
                      type="color"
                      value={colorValue}
                      onChange={(e) =>
                        onParamChange(effect.id, uni.name, e.target.value)
                      }
                      className="uniform-color-picker"
                    />
                    <span className="color-hex-text">{colorValue}</span>
                  </div>
                )}

                {/* Vec2 Sliders (Dual X/Y sliders) */}
                {uni.type === 'vec2' && (
                  <div className="vec2-control-group">
                    <div className="vec2-slider-row">
                      <span className="vec2-axis-label">X:</span>
                      <input
                        type="range"
                        min={uni.min ?? -0.05}
                        max={uni.max ?? 0.05}
                        step={uni.step ?? 0.001}
                        value={vectorValue[0]}
                        onChange={(e) =>
                          onParamChange(effect.id, uni.name, [
                            parseFloat(e.target.value),
                            vectorValue[1],
                          ])
                        }
                        className="uniform-slider"
                      />
                      <span className="vec2-val">
                        {Number(vectorValue[0]).toFixed(3)}
                      </span>
                    </div>
                    <div className="vec2-slider-row">
                      <span className="vec2-axis-label">Y:</span>
                      <input
                        type="range"
                        min={uni.min ?? -0.05}
                        max={uni.max ?? 0.05}
                        step={uni.step ?? 0.001}
                        value={vectorValue[1]}
                        onChange={(e) =>
                          onParamChange(effect.id, uni.name, [
                            vectorValue[0],
                            parseFloat(e.target.value),
                          ])
                        }
                        className="uniform-slider"
                      />
                      <span className="vec2-val">
                        {Number(vectorValue[1]).toFixed(3)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
