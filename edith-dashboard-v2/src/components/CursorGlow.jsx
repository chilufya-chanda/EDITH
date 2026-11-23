import { useEffect } from 'react';

/**
 * Renders the fixed glow layer (styled in index.css as #cursor-glow) and
 * keeps its position in sync with the pointer via CSS custom properties
 * rather than re-rendering React on every mousemove — updating two CSS
 * variables directly is dramatically cheaper than a state-driven
 * re-render at pointer-move frequency, and rAF-throttling keeps it smooth
 * without flooding the main thread.
 */
export default function CursorGlow() {
  useEffect(() => {
    let frame = null;
    let latest = null;

    function onPointerMove(e) {
      latest = e;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--cursor-x', `${latest.clientX}px`);
        document.documentElement.style.setProperty('--cursor-y', `${latest.clientY}px`);
        frame = null;
      });
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div id="cursor-glow" aria-hidden="true" />;
}
