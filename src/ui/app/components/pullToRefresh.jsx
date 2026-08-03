import React from 'react';
import { Box, Spinner } from '@chakra-ui/react';

const THRESHOLD = 64; // px of pull required to trigger a refresh
const MAX_PULL = 96; // clamp how far the content follows the finger
const RESISTANCE = 0.5; // finger travel -> content travel (rubber-band feel)

/**
 * Walk up from `node` to the nearest actually-scrollable ancestor so pull only
 * engages when that scroller is already at the top. Falls back to the document.
 */
const findScrollParent = (node) => {
  let el = node;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
};

/**
 * Touch pull-to-refresh wrapper. Adds a native-feeling pull gesture (mobile /
 * WebView) that invokes `onRefresh` when released past the threshold, without
 * altering the child's own scrolling. On desktop it is inert (no touch events),
 * so pages should still expose an explicit refresh control there.
 */
const PullToRefresh = ({ onRefresh, isRefreshing = false, children, ...boxProps }) => {
  const wrapRef = React.useRef(null);
  const scrollElRef = React.useRef(null);
  const startYRef = React.useRef(null);
  const [pull, setPull] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    scrollElRef.current = wrapRef.current
      ? findScrollParent(wrapRef.current)
      : null;
  }, []);

  const atTop = () => {
    const el = scrollElRef.current;
    return !el || el.scrollTop <= 0;
  };

  const handleTouchStart = (e) => {
    if (busy || isRefreshing || !atTop()) {
      startYRef.current = null;
      return;
    }
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    if (startYRef.current == null) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta <= 0 || !atTop()) {
      setPull(0);
      if (!atTop()) startYRef.current = null;
      return;
    }
    setPull(Math.min(MAX_PULL, delta * RESISTANCE));
  };

  const handleTouchEnd = async () => {
    if (startYRef.current == null) return;
    const shouldRefresh = pull >= THRESHOLD;
    startYRef.current = null;
    setPull(0);
    if (shouldRefresh && onRefresh && !busy) {
      try {
        setBusy(true);
        await onRefresh();
      } finally {
        setBusy(false);
      }
    }
  };

  const showSpinner = busy || isRefreshing;
  const indicatorHeight = Math.max(pull, showSpinner ? 32 : 0);

  return (
    <Box
      ref={wrapRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      position="relative"
      {...boxProps}
    >
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        display="flex"
        alignItems="center"
        justifyContent="center"
        pointerEvents="none"
        zIndex={10}
        height={`${indicatorHeight}px`}
        opacity={pull > 0 || showSpinner ? 1 : 0}
        transition="opacity 0.15s ease"
        data-testid="pull-to-refresh-indicator"
      >
        <Spinner size="sm" color="yellow.400" speed="0.65s" />
      </Box>
      <Box
        transform={`translateY(${pull}px)`}
        transition={startYRef.current == null ? 'transform 0.2s ease' : 'none'}
        willChange="transform"
      >
        {children}
      </Box>
    </Box>
  );
};

export default PullToRefresh;
