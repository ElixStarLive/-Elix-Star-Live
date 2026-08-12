/**
 * Mounted flag for async auth forms (Login / Register).
 */

import { useEffect, useRef, type MutableRefObject } from 'react';

export function useIsMountedRef(): MutableRefObject<boolean> {
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  return isMounted;
}
