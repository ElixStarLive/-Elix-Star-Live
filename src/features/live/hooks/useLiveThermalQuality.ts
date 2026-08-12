import { useEffect } from 'react';
import type { Room } from 'livekit-client';
import {
  registerLiveThermalTarget,
  releaseThermalQualityManager,
  retainThermalQualityManager,
} from '../../../lib/live/thermalQualityManager';

/**
 * Register this live surface with the shared thermal quality manager.
 * One implementation for host, spectator, co-host, and battle joiner.
 */
export function useLiveThermalQuality(opts: {
  enabled: boolean;
  getRoom: () => Room | null;
  getCameraVideoTrack: () => MediaStreamTrack | null | undefined;
  getCameraFacing: () => 'user' | 'environment';
  publishesCamera: boolean;
  getBattleRemoteCount?: () => number;
}): void {
  const {
    enabled,
    getRoom,
    getCameraVideoTrack,
    getCameraFacing,
    publishesCamera,
    getBattleRemoteCount,
  } = opts;

  useEffect(() => {
    if (!enabled) return;
    retainThermalQualityManager();
    const unregister = registerLiveThermalTarget({
      getRoom,
      getCameraVideoTrack,
      getCameraFacing,
      publishesCamera,
      getBattleRemoteCount,
    });
    return () => {
      unregister();
      releaseThermalQualityManager();
    };
  }, [
    enabled,
    getRoom,
    getCameraVideoTrack,
    getCameraFacing,
    publishesCamera,
    getBattleRemoteCount,
  ]);
}
