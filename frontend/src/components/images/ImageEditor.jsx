import { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/Button';
import { RotateCcw, RotateCw, FlipHorizontal, FlipVertical, Save, X, RefreshCcw } from 'lucide-react';
import { useImageStore } from '../../store/imageStore';
import { useTranslation } from '../../hooks/useTranslation';

export const ImageEditor = ({ image, onClose }) => {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [imgObj, setImgObj] = useState(null);
  
  const [settings, setSettings] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    rotation: 0,
    flipH: 1,
    flipV: 1,
  });

  const [isSaving, setIsSaving] = useState(false);
  const uploadImage = useImageStore((state) => state.uploadImage);

  // Load image onto canvas (bypass browser cache for CORS)
  useEffect(() => {
    let objectUrl = null;

    const loadImage = async () => {
      try {
        // Fetch the image to bypass disk cache which might not have CORS headers
        const response = await fetch(image.resizedUrl || image.thumbnailUrl, {
          mode: 'cors',
          cache: 'reload' // Force a new request to get the Access-Control-Allow-Origin header
        });
        
        if (!response.ok) throw new Error("Network response was not ok");
        
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        
        const img = new Image();
        img.onload = () => {
          setImgObj(img);
        };
        img.src = objectUrl;
      } catch (err) {
        console.error("Failed to load image for editing:", err);
        // Fallback to standard Image loading if fetch fails
        const fallbackImg = new Image();
        fallbackImg.crossOrigin = "anonymous";
        fallbackImg.onload = () => setImgObj(fallbackImg);
        fallbackImg.src = image.resizedUrl || image.thumbnailUrl;
      }
    };

    loadImage();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image]);

  // Apply filters and transforms
  useEffect(() => {
    if (!imgObj || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Calculate canvas size based on rotation
    // If rotated 90 or 270 degrees, swap width and height
    const isRotated = settings.rotation % 180 !== 0;
    canvas.width = isRotated ? imgObj.height : imgObj.width;
    canvas.height = isRotated ? imgObj.width : imgObj.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set filters
    ctx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturation}%)`;

    // Move to center, rotate, flip, and move back
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((settings.rotation * Math.PI) / 180);
    ctx.scale(settings.flipH, settings.flipV);
    
    // Draw image centered
    ctx.drawImage(
      imgObj,
      -imgObj.width / 2,
      -imgObj.height / 2,
      imgObj.width,
      imgObj.height
    );
  }, [imgObj, settings]);

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const rotate = (degrees) => {
    setSettings((prev) => ({ ...prev, rotation: prev.rotation + degrees }));
  };

  const flip = (axis) => {
    setSettings((prev) => ({
      ...prev,
      [axis]: prev[axis] === 1 ? -1 : 1,
    }));
  };

  const reset = () => {
    setSettings({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      rotation: 0,
      flipH: 1,
      flipV: 1,
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
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{t('editor.title')}</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Button variant="outline" onClick={onClose} disabled={isSaving} icon={<X size={16} />}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSave} loading={isSaving} icon={<Save size={16} />}>{t('editor.saveCopy')}</Button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Canvas Area */}
        <div style={{ 
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', 
          padding: '2rem', background: '#000', overflow: 'auto'
        }}>
          {!imgObj && <div className="animate-pulse">Loading image...</div>}
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
        </div>

        {/* Sidebar Controls */}
        <div style={{
          width: '320px', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-color)',
          padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2rem'
        }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{t('editor.adjustments')}</h3>
            <Button variant="ghost" size="sm" onClick={reset} icon={<RefreshCcw size={14}/>}>{t('editor.reset')}</Button>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                <span>{t('editor.brightness')}</span>
                <span>{settings.brightness}%</span>
              </div>
              <input 
                type="range" min="0" max="200" value={settings.brightness} 
                onChange={(e) => handleChange('brightness', e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                <span>{t('editor.contrast')}</span>
                <span>{settings.contrast}%</span>
              </div>
              <input 
                type="range" min="0" max="200" value={settings.contrast} 
                onChange={(e) => handleChange('contrast', e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                <span>{t('editor.saturation')}</span>
                <span>{settings.saturation}%</span>
              </div>
              <input 
                type="range" min="0" max="200" value={settings.saturation} 
                onChange={(e) => handleChange('saturation', e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.5 }} />

          {/* Transform Controls */}
          <div>
            <h3 style={{ fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '1rem' }}>{t('editor.transform')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <Button variant="outline" size="sm" onClick={() => rotate(-90)} icon={<RotateCcw size={16}/>}>-90°</Button>
              <Button variant="outline" size="sm" onClick={() => rotate(90)} icon={<RotateCw size={16}/>}>+90°</Button>
              <Button variant="outline" size="sm" onClick={() => flip('flipH')} icon={<FlipHorizontal size={16}/>}>{t('editor.flipH')}</Button>
              <Button variant="outline" size="sm" onClick={() => flip('flipV')} icon={<FlipVertical size={16}/>}>{t('editor.flipV')}</Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
