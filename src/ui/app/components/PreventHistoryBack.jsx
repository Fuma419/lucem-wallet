import React from 'react';
import {
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';

/**
 * Cancels browser back and mobile swipe-back (history POP) by restoring the last
 * in-app route. PUSH/REPLACE navigations update the lock. Use explicit
 * `navigate('/path', { replace: true })` for in-app back buttons — not `navigate(-1)`.
 */
export default function PreventHistoryBack() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const lockedRef = React.useRef('');

  const pathKey = `${location.pathname}${location.search}${location.hash}`;

  React.useLayoutEffect(() => {
    if (navigationType === 'POP') {
      const locked = lockedRef.current;
      if (locked && locked !== pathKey) {
        navigate(locked, { replace: true });
      } else if (!locked) {
        // Initial document load is often POP with no prior lock; adopt current URL.
        lockedRef.current = pathKey;
      }
      return;
    }
    lockedRef.current = pathKey;
  }, [pathKey, navigationType, navigate]);

  return null;
}
