import React from 'react';

/**
 * Full-page wash copied from the Magic Delegation Portal Once UI Background:
 * a dual radial glow (network accent on the left, cyan on the right) plus a
 * faint dot grid, revealed under a cursor-following mask.
 */
const PageBackground = () => {
  const layerRef = React.useRef(null);
  const cursorRef = React.useRef({ x: 0, y: 0 });
  const [smooth, setSmooth] = React.useState({ x: 0, y: 0 });
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(Boolean(mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  React.useEffect(() => {
    if (reduceMotion) return undefined;
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
  }, [reduceMotion]);

  React.useEffect(() => {
    if (reduceMotion) return undefined;
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
  }, [reduceMotion]);

  const maskStyle = reduceMotion
    ? undefined
    : {
        WebkitMaskImage: `radial-gradient(circle 600px at ${smooth.x}px ${smooth.y}px, rgba(0, 0, 0, 1) 20%, rgba(0, 0, 0, 0) 100%)`,
        maskImage: `radial-gradient(circle 600px at ${smooth.x}px ${smooth.y}px, rgba(0, 0, 0, 1) 20%, rgba(0, 0, 0, 0) 100%)`,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
      };

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
