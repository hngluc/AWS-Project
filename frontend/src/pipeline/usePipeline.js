import { useCallback, useEffect, useRef } from 'react';
import { WebGLPipeline } from './WebGLPipeline';

export function usePipeline(
  canvasRef,
  sourceElement,
  activeEffects,
  isContinuous
) {
  const pipelineRef = useRef(null);
  const animationFrameIdRef = useRef(null);

  // Core render function to draw a single frame
  const renderFrame = useCallback(() => {
    if (pipelineRef.current && sourceElement) {
      pipelineRef.current.render(sourceElement);
    }
  }, [sourceElement]);

  // 1. Initialize/recreate pipeline when the canvas is mounted
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let pipeline;
    try {
      pipeline = new WebGLPipeline(canvas);
      pipelineRef.current = pipeline;
    } catch (err) {
      console.error('Failed to initialize WebGL post-processing pipeline:', err);
      return;
    }

    return () => {
      if (pipelineRef.current) {
        pipelineRef.current.destroy();
        pipelineRef.current = null;
      }
    };
  }, [canvasRef]);

  // 2. Synchronize active effects configuration
  useEffect(() => {
    if (pipelineRef.current) {
      pipelineRef.current.updateEffects(activeEffects);
      if (!isContinuous) {
        renderFrame(); // Redraw static frame on uniform change
      }
    }
  }, [activeEffects, isContinuous, renderFrame]);

  // 3. Handle window/element resizing for static images (forces redraw on resize)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      if (!isContinuous) {
        renderFrame();
      }
    });

    const parent = canvas.parentElement || canvas;
    resizeObserver.observe(parent);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvasRef, isContinuous, sourceElement, renderFrame]);

  // 4. Render loop manager (Continuous vs. Static/Lazy)
  useEffect(() => {
    let active = true;

    const tick = () => {
      if (!active) return;

      renderFrame();

      if (isContinuous) {
        animationFrameIdRef.current = requestAnimationFrame(tick);
      }
    };

    if (isContinuous) {
      // In continuous mode, run requestAnimationFrame
      animationFrameIdRef.current = requestAnimationFrame(tick);
    } else {
      // In static mode, render once immediately and attach load listeners if needed
      if (sourceElement) {
        if (sourceElement instanceof HTMLImageElement) {
          if (sourceElement.complete) {
            renderFrame();
          } else {
            const onLoad = () => {
              if (active) renderFrame();
            };
            sourceElement.addEventListener('load', onLoad);
            return () => {
              active = false;
              sourceElement.removeEventListener('load', onLoad);
              if (animationFrameIdRef.current !== null) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
              }
            };
          }
        } else {
          // Video source is static (e.g. paused)
          renderFrame();
        }
      }
    }

    return () => {
      active = false;
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [sourceElement, isContinuous, renderFrame]);

  return pipelineRef;
}
