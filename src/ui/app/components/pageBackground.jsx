import React from 'react';

/**
 * Full-page wash copied from the Magic Delegation Portal Once UI Background:
 * a dual radial glow (network accent on the left, cyan on the right) plus a
 * faint dot grid. On fine pointers it is revealed under a cursor-following
 * mask; on touch / reduced-motion the full wash stays visible.
 */
const PageBackground = () => {
  const layerRef = React.useRef(null);
  const cursorRef = React.useRef({ x: 0, y: 0 });
  const [smooth, setSmooth] = React.useState({ x: 0, y: 0 });
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

  const useMask = !reduceMotion && pointerFine;

  React.useEffect(() => {
    if (!useMask) return undefined;
    const centerOnLayer = () => {
      const el = layerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = { x: rect.width / 2, y: rect.height / 2 };
      cursorRef.current = next;
      setSmooth(next);
    };
    centerOnLayer();
    const onMove = (event) => {
      const el = layerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      cursorRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, [useMask]);

  React.useEffect(() => {
    if (!useMask) return undefined;
    let frame;
    const tick = () => {
      setSmooth((prev) => {
        const { x, y } = cursorRef.current;
        const nx = Math.round(prev.x + (x - prev.x) * 0.2);
        const ny = Math.round(prev.y + (y - prev.y) * 0.2);
        if (nx === prev.x && ny === prev.y) return prev;
        return { x: nx, y: ny };
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [useMask]);

  const maskStyle = useMask
    ? {
        WebkitMaskImage: `radial-gradient(circle 600px at ${smooth.x}px ${smooth.y}px, rgba(0, 0, 0, 1) 20%, rgba(0, 0, 0, 0) 100%)`,
        maskImage: `radial-gradient(circle 600px at ${smooth.x}px ${smooth.y}px, rgba(0, 0, 0, 1) 20%, rgba(0, 0, 0, 0) 100%)`,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
      }
    : undefined;

  return (
    <>
      <div
        ref={layerRef}
        className="lucem-page-bg lucem-page-bg-gradient"
        style={maskStyle}
        aria-hidden="true"
        data-testid="lucem-page-background"
      />
      <div
        className="lucem-page-bg lucem-page-bg-dots"
        style={maskStyle}
        aria-hidden="true"
      />
    </>
  );
};

export default PageBackground;
