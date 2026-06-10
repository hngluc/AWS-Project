import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '../ui/Button';
import { Save, X } from 'lucide-react';
import { useImageStore } from '../../store/imageStore';
import { useTranslation } from '../../hooks/useTranslation';
import { usePipeline } from '../../pipeline/usePipeline';
import { AVAILABLE_EFFECTS } from '../../pipeline/shaders';
import { ShaderStack } from './ShaderStack';
import './ShaderEditor.css';

const MAX_ACTIVE_EFFECTS = 5;

const EFFECT_RECIPES = [
  {
    name: 'Cyber Pulse',
    effects: [
      { type: 'neon-edge', enabled: true, params: { u_edgeColor: '#00f5ff', u_strength: 1.8, u_threshold: 0.1, u_background: 0.18 } },
      { type: 'chromatic-aberration', enabled: true, params: { u_redOffset: [0.008, 0.0], u_blueOffset: [-0.008, 0.0], u_radial: 0.025, u_mixIntensity: 1.0 } },
      { type: 'wave-distortion', enabled: true, params: { u_amplitude: 0.012, u_frequency: 24.0, u_speed: 5.0, u_direction: 0.0, u_mixIntensity: 1.0 } },
    ],
  },
  {
    name: 'Print Lab',
    effects: [
      { type: 'halftone-print', enabled: true, params: { u_dotSize: 110.0, u_angle: 0.35, u_contrast: 1.4, u_mixIntensity: 0.92 } },
      { type: 'grayscale', enabled: true, params: { u_intensity: 0.35 } },
      { type: 'tint', enabled: true, params: { u_tintColor: '#ff5c35', u_intensity: 0.22 } },
    ],
  },
  {
    name: 'Mirror Dream',
    effects: [
      { type: 'kaleidoscope', enabled: true, params: { u_segments: 10.0, u_rotation: 0.0, u_zoom: 1.12, u_speed: 0.06 } },
      { type: 'radial-blur', enabled: true, params: { u_center: [0.5, 0.5], u_strength: 0.12, u_samples: 10.0 } },
      { type: 'palettization', enabled: true, params: { u_palette: 1.0, u_mixIntensity: 0.35 } },
    ],
  },
  {
    name: 'Aqua Prism',
    effects: [
      { type: 'water-ripple', enabled: true, params: { u_center: [0.5, 0.5], u_amplitude: 0.022, u_frequency: 46.0, u_speed: 5.5, u_decay: 2.0, u_highlight: 0.55 } },
      { type: 'cube-party', enabled: true, params: { u_grid: 5.0, u_cubeSize: 0.62, u_motion: 1.1, u_depth: 1.0, u_perspective: 1.9, u_edgeGlow: 0.85 } },
      { type: 'chromatic-aberration', enabled: true, params: { u_redOffset: [0.004, 0.0], u_blueOffset: [-0.004, 0.0], u_radial: 0.045, u_mixIntensity: 0.72 } },
    ],
  },
  {
    name: 'Signal Melt',
    effects: [
      { type: 'pixel-sort', enabled: true, params: { u_threshold: 0.48, u_amount: 0.26, u_direction: 1.0, u_jitter: 0.42 } },
      { type: 'bad-tv', enabled: true, params: { u_glitchFrequency: 0.38, u_glitchIntensity: 0.24 } },
      { type: 'crt-display', enabled: true, params: { u_curvature: 0.07, u_scanlines: 0.48, u_grille: 0.28, u_vignette: 0.55, u_glow: 0.32 } },
    ],
  },
  {
    name: 'Future Chrome',
    effects: [
      { type: 'fractal-glass', enabled: true, params: { u_cells: 9.0, u_refraction: 0.014, u_rotation: 0.18, u_bevel: 0.075, u_speed: 0.18 } },
      { type: 'holographic-chrome', enabled: true, params: { u_relief: 9.0, u_spectrum: 2.8, u_metallic: 0.85, u_shimmer: 0.42, u_mixIntensity: 0.82 } },
    ],
  },
  {
    name: 'Analog Terminal',
    effects: [
      { type: 'ascii-vision', enabled: true, params: { u_cellSize: 11.0, u_contrast: 1.55, u_inkColor: '#73ffb2', u_colorMix: 0.28, u_background: 0.06 } },
      { type: 'turbulent-dissolve', enabled: true, params: { u_progress: 0.38, u_scale: 6.0, u_edgeWidth: 0.1, u_edgeColor: '#ff6a1a', u_speed: 0.05 } },
      { type: 'crt-display', enabled: true, params: { u_curvature: 0.055, u_scanlines: 0.58, u_grille: 0.22, u_vignette: 0.72, u_glow: 0.28 } },
    ],
  },
];

const createEffectId = (type) =>
  `${type}-${typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

const normalizeEffectStack = (effects) => {
  const seenTypes = new Set();
  return effects.filter((effect) => {
    if (!AVAILABLE_EFFECTS[effect.type] || seenTypes.has(effect.type)) {
      return false;
    }
    seenTypes.add(effect.type);
    return true;
  }).slice(0, MAX_ACTIVE_EFFECTS);
};

export const ShaderEditor = ({ image, onClose }) => {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  
  const [sourceElement, setSourceElement] = useState(null);
  const [stackNotice, setStackNotice] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const uploadImage = useImageStore((state) => state.uploadImage);

  // Active effect stack state
  const [activeEffects, setActiveEffects] = useState([
    {
      id: 'chromatic-aberration-init',
      type: 'chromatic-aberration',
      enabled: true,
      params: { u_redOffset: [0.006, 0.0], u_blueOffset: [-0.006, 0.0], u_radial: 0.025, u_mixIntensity: 1.0 },
    },
    {
      id: 'pixelate-init',
      type: 'pixelate',
      enabled: false,
      params: { u_pixelSize: 8.0, u_colorLevels: 32.0, u_softness: 0.04 },
    },
    {
      id: 'wave-distortion-init',
      type: 'wave-distortion',
      enabled: false,
      params: { u_amplitude: 0.015, u_frequency: 15.0, u_speed: 5.0, u_direction: 0.0, u_mixIntensity: 1.0 },
    },
  ]);

  const imageRefCallback = useCallback((el) => {
    imageRef.current = el;
    setSourceElement(el);
  }, []);

  const isContinuous = activeEffects.some(
    (e) => e.enabled && AVAILABLE_EFFECTS[e.type]?.isTimeDependent
  );

  // Connect WebGL rendering pipeline
  usePipeline(canvasRef, sourceElement, activeEffects, isContinuous);

  const handleAddEffect = (type) => {
    const effectDef = AVAILABLE_EFFECTS[type];
    if (!effectDef) return;

    const defaultParams = {};
    effectDef.uniforms.forEach((uni) => {
      defaultParams[uni.name] = uni.defaultValue;
    });

    const newEffect = {
      id: createEffectId(type),
      type,
      enabled: true,
      params: defaultParams,
    };

    setActiveEffects((prev) => {
      if (prev.some((effect) => effect.type === type)) {
        setStackNotice(`${effectDef.name} is already in the stack.`);
        return prev;
      }
      if (prev.length >= MAX_ACTIVE_EFFECTS) {
        setStackNotice(`A media source can use at most ${MAX_ACTIVE_EFFECTS} effects.`);
        return prev;
      }
      setStackNotice(null);
      return normalizeEffectStack([...prev, newEffect]);
    });
  };

  const handleReorderEffects = (effects) => {
    setActiveEffects(normalizeEffectStack(effects));
  };

  const handleApplyRecipe = (recipe) => {
    const recipeEffects = recipe.effects.map((effect) => ({
      ...effect,
      id: createEffectId(effect.type),
      params: { ...effect.params },
    }));
    setActiveEffects(normalizeEffectStack(recipeEffects));
    setStackNotice(`${recipe.name} recipe applied.`);
  };

  const handleRemoveEffect = (id) => {
    setActiveEffects((prev) => prev.filter((e) => e.id !== id));
  };

  const handleToggleEffect = (id) => {
    setActiveEffects((prev) =>
      prev.map((e) => {
        if (e.id === id) {
          return { ...e, enabled: !e.enabled };
        }
        return e;
      })
    );
  };

  const handleParamChange = (effectId, paramName, value) => {
    setActiveEffects((prev) =>
      prev.map((e) => {
        if (e.id === effectId) {
          return {
            ...e,
            params: { ...e.params, [paramName]: value },
          };
        }
        return e;
      })
    );
  };

  const handleMoveEffect = (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= activeEffects.length) return;

    setActiveEffects((prev) => {
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return updated;
    });
  };

  const handleSave = async () => {
    if (!canvasRef.current) return;
    setIsSaving(true);
    
    try {
      // Export canvas to Blob
      const blob = await new Promise((resolve) => {
        canvasRef.current.toBlob(resolve, 'image/jpeg', 0.95);
      });

      if (!blob) throw new Error("Failed to generate image data");

      // Create a File object from Blob
      const editedFileName = `edited_${image.originalFilename}`;
      const file = new File([blob], editedFileName, { type: 'image/jpeg' });

      // Upload the new image using existing upload flow
      await uploadImage(file);
      
      onClose(); // Close editor
    } catch (error) {
      console.error("Save failed:", error);
      alert(error.message || "Failed to save edited image.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10, 10, 10, 0.95)',
      display: 'flex', flexDirection: 'column',
      color: '#fff'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1rem 2rem', borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-surface)'
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>WebGL Shader Lab</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Button variant="outline" onClick={onClose} disabled={isSaving} icon={<X size={16} />}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSave} loading={isSaving} icon={<Save size={16} />}>Save as Copy</Button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Canvas Area */}
        <div style={{ 
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', 
          padding: '2rem', background: '#000', overflow: 'auto'
        }}>
          <canvas 
            ref={canvasRef} 
            style={{ 
              maxWidth: '100%', 
              maxHeight: '100%', 
              objectFit: 'contain',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              borderRadius: '4px'
            }} 
          />
          <img
            ref={imageRefCallback}
            src={image.resizedUrl || image.thumbnailUrl}
            crossOrigin="anonymous"
            style={{ display: 'none' }}
            alt="Source"
          />
        </div>

        {/* Sidebar Controls */}
        <div style={{
          width: '400px', display: 'flex', flexDirection: 'column'
        }}>
          <ShaderStack
            activeEffects={activeEffects}
            onReorder={handleReorderEffects}
            onToggle={handleToggleEffect}
            onRemove={handleRemoveEffect}
            onParamChange={handleParamChange}
            onMove={handleMoveEffect}
            onAdd={handleAddEffect}
            onApplyRecipe={handleApplyRecipe}
            recipes={EFFECT_RECIPES}
            maxEffects={MAX_ACTIVE_EFFECTS}
            notice={stackNotice}
            isContinuous={isContinuous}
          />
        </div>
      </div>
    </div>
  );
};
