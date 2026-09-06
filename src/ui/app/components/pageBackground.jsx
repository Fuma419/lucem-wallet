import React from 'react';

/**
 * Full-page wash copied from the Magic Delegation Portal Once UI Background:
 * a dual radial glow (network accent + cyan) plus a faint dot grid.
 * On fine pointers the glow tracks the cursor so it appears anywhere on the
 * page; on touch / reduced-motion a static full-page wash stays visible.
 */
const PageBackground = () => {
  const layerRef = React.useRef(null);
  const cursorRef = React.useRef({ x: 0, y: 0 });
  const smoothRef = React.useRef({ x: 0, y: 0 });
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const [pointerFine, setPointerFine] = React.useState(false);

  React.useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const apply = () => {
      setReduceMotion(Boolean(motion.matches));
      setPointerFine(Boolean(pointer.matches));
    };
    apply();
    motion.addEventListener('change', apply);
    pointer.addEventListener('change', apply);
    return () => {
      motion.removeEventListener('change', apply);
      pointer.removeEventListener('change', apply);
    };
  }, []);

  const useCursor = !reduceMotion && pointerFine;

  React.useEffect(() => {
    if (!useCursor) return undefined;
    const el = layerRef.current;
    const paint = (x, y) => {
      if (!el) return;
      el.style.setProperty('--lucem-cursor-x', `${x}px`);
      el.style.setProperty('--lucem-cursor-y', `${y}px`);
    };
    const centerOnLayer = () => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = { x: rect.width / 2, y: rect.height / 2 };
      cursorRef.current = next;
      smoothRef.current = next;
      paint(next.x, next.y);
    };
    centerOnLayer();
    const onMove = (event) => {
      const node = layerRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      cursorRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    let frame;
    const tick = () => {
      const { x, y } = cursorRef.current;
      const prev = smoothRef.current;
      const nx = prev.x + (x - prev.x) * 0.2;
      const ny = prev.y + (y - prev.y) * 0.2;
      smoothRef.current = { x: nx, y: ny };
      paint(nx, ny);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [useCursor]);

  return (
    <div
      ref={layerRef}
      className={`lucem-page-bg${useCursor ? ' lucem-page-bg--cursor' : ''}`}
      aria-hidden="true"
      data-testid="lucem-page-background"
    >
      <div className="lucem-page-bg-gradient" />
      <div className="lucem-page-bg-dots" />
    </div>
  );
};

export default PageBackground;
