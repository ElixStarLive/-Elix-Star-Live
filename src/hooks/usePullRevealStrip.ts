import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

/**
 * Push down from top → show strip; push up → hide.
 * Same gesture behavior as FriendsFeed story circles.
 */
export function usePullRevealStrip(
  pageRef: RefObject<HTMLElement | null>,
  opts?: { disabled?: boolean; initiallyVisible?: boolean },
) {
  const disabled = !!opts?.disabled;
  const [visible, setVisible] = useState(!!opts?.initiallyVisible);
  const touchStartYRef = useRef<number | null>(null);

  const onPullPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (disabled) return;
      touchStartYRef.current = e.clientY;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [disabled],
  );

  const onPullPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (disabled) return;
      const startY = touchStartYRef.current;
      if (startY == null) return;
      const dy = e.clientY - startY;
      if (dy > 10) {
        setVisible(true);
        touchStartYRef.current = e.clientY;
      } else if (dy < -10) {
        setVisible(false);
        touchStartYRef.current = e.clientY;
      }
    },
    [disabled],
  );

  const onPullPointerUp = useCallback(() => {
    touchStartYRef.current = null;
  }, []);

  useEffect(() => {
    const root = pageRef.current;
    if (!root || disabled) return;

    let startY: number | null = null;

    const onDown = (e: PointerEvent) => {
      startY = e.clientY;
    };

    const onMove = (e: PointerEvent) => {
      if (startY == null) return;
      const dy = e.clientY - startY;
      if (dy > 10) {
        setVisible(true);
        startY = e.clientY;
      } else if (dy < -10) {
        setVisible(false);
        startY = e.clientY;
      }
    };

    const onUp = () => {
      startY = null;
    };

    root.addEventListener('pointerdown', onDown, { capture: true });
    root.addEventListener('pointermove', onMove, { capture: true });
    root.addEventListener('pointerup', onUp, { capture: true });
    root.addEventListener('pointercancel', onUp, { capture: true });
    return () => {
      root.removeEventListener('pointerdown', onDown, true);
      root.removeEventListener('pointermove', onMove, true);
      root.removeEventListener('pointerup', onUp, true);
      root.removeEventListener('pointercancel', onUp, true);
    };
  }, [pageRef, disabled]);

  const pullZoneProps = {
    className: 'absolute inset-x-0 top-0 z-[35] h-[28%]' as const,
    style: { touchAction: 'none' as const },
    onPointerDown: onPullPointerDown,
    onPointerMove: onPullPointerMove,
    onPointerUp: onPullPointerUp,
    onPointerCancel: onPullPointerUp,
    'aria-hidden': true as const,
  };

  return { visible, setVisible, pullZoneProps };
}
