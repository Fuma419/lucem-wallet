import React from 'react';
import {
  DESKTOP_MIN_WIDTH,
  detectLucemLayoutSurface,
  LUCEM_LAYOUT,
} from './surface';

const LayoutSurfaceContext = React.createContext(LUCEM_LAYOUT.touch);

const applyLayoutAttr = (surface) => {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.dataset.layout = surface;
};

const subscribeMedia = (mq, onChange) => {
  if (!mq) return () => {};
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }
  if (typeof mq.addListener === 'function') {
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }
  return () => {};
};

export const LayoutSurfaceProvider = ({ children }) => {
  const [surface, setSurface] = React.useState(() => {
    const next =
      typeof window !== 'undefined'
        ? detectLucemLayoutSurface(window)
        : LUCEM_LAYOUT.touch;
    applyLayoutAttr(next);
    return next;
  });

  React.useEffect(() => {
    const update = () => {
      const next = detectLucemLayoutSurface(window);
      applyLayoutAttr(next);
      setSurface(next);
    };
    update();
    if (typeof window.matchMedia !== 'function') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const unsubs = [
      subscribeMedia(
        window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`),
        update
      ),
      subscribeMedia(window.matchMedia('(pointer: fine)'), update),
      subscribeMedia(window.matchMedia('(hover: hover)'), update),
    ];
    window.addEventListener('resize', update);
    return () => {
      unsubs.forEach((off) => off());
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <LayoutSurfaceContext.Provider value={surface}>
      {children}
    </LayoutSurfaceContext.Provider>
  );
};

export const useLayoutSurface = () => React.useContext(LayoutSurfaceContext);
