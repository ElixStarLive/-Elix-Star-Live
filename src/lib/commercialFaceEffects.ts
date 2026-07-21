import type { LiveFaceEffectsEngine } from './liveFaceEffectsProvider';

let commercialReady = false;
let initAttempted = false;

/**
 * Commercial face SDK slot (DeepAR / Banuba).
 * Set VITE_DEEPAR_LICENSE_KEY or VITE_BANUBA_CLIENT_TOKEN, then install the SDK package
 * and wire init here. Until then, MediaPipe tracking is used automatically.
 */
export async function initCommercialFaceEngine(
  engine: LiveFaceEffectsEngine,
): Promise<boolean> {
  if (engine === 'mediapipe') {
    commercialReady = false;
    return false;
  }
  if (initAttempted) return commercialReady;
  initAttempted = true;

  const hasDeepAR = Boolean(String(import.meta.env.VITE_DEEPAR_LICENSE_KEY || '').trim());
  const hasBanuba = Boolean(String(import.meta.env.VITE_BANUBA_CLIENT_TOKEN || '').trim());

  if (engine === 'deepar' && hasDeepAR) {
    // Install `deepar` and initialize with VITE_DEEPAR_LICENSE_KEY when ready.
    commercialReady = false;
  } else if (engine === 'banuba' && hasBanuba) {
    // Install `@banuba/webar` and initialize with VITE_BANUBA_CLIENT_TOKEN when ready.
    commercialReady = false;
  }

  return commercialReady;
}

export function isCommercialSdkActive(): boolean {
  return commercialReady;
}

/** MediaPipe tracks the face unless a commercial SDK is actually loaded. */
export function useMediaPipeForTracking(engine: LiveFaceEffectsEngine): boolean {
  return engine === 'mediapipe' || !commercialReady;
}
