/**
 * Shared mist-fog client expiry (server expires_at → clear state).
 */

import { useEffect, type Dispatch, type SetStateAction } from 'react';

/** Clear mist fog when expiresAt elapses. */
export function useMistFogAutoExpire<T extends { expiresAt: number }>(
  mistFog: T | null,
  setMistFog: Dispatch<SetStateAction<T | null>>,
): void {
  useEffect(() => {
    if (!mistFog) return;
    const ms = mistFog.expiresAt - Date.now();
    if (ms <= 0) {
      setMistFog(null);
      return;
    }
    const t = setTimeout(() => setMistFog(null), ms);
    return () => clearTimeout(t);
  }, [mistFog, setMistFog]);
}
