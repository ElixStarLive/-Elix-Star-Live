/**
 * Commercial face SDK slot (DeepAR / Banuba).
 * Until the SDK package is installed AND initialized here, this never reports ready.
 * MediaPipe is the production tracking path — not a silent fake commercial success.
 */
import type { LiveFaceEffectsEngine } from './liveFaceEffectsProvider';

let commercialReady = false;
let initAttempted = false;

export async function initCommercialFaceEngine(
  engine: LiveFaceEffectsEngine,
): Promise<boolean> {
  if (engine === 'mediapipe') {
    commercialReady = false;
    return false;
  }
  if (initAttempted) return commercialReady;
  initAttempted = true;
  commercialReady = false;
  // License env alone is not enough — SDK init is not wired in this build.
  // Callers must use MediaPipe via shouldTrackWithMediaPipe until this returns true.
  return false;
}

export function isCommercialSdkActive(): boolean {
  return commercialReady;
}

/** MediaPipe tracks the face unless a commercial SDK is actually loaded. */
export function shouldTrackWithMediaPipe(engine: LiveFaceEffectsEngine): boolean {
  return engine === 'mediapipe' || !commercialReady;
}
