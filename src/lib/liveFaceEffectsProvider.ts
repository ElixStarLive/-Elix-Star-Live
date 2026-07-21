/**
 * Creator live face-effects provider selection.
 * - mediapipe: free face tracking (default, always available)
 * - deepar / banuba: commercial SDK slots — active only when license env is set
 */
export type LiveFaceEffectsEngine = 'mediapipe' | 'deepar' | 'banuba';

export type LiveFaceEffectOption = {
  id: string;
  name: string;
  preview: string;
  type: string;
  color: string;
};

export const LIVE_FACE_EFFECT_OPTIONS: LiveFaceEffectOption[] = [
  { id: 'face-none', name: 'No Face FX', preview: '🎬', type: 'none', color: '#FFFFFF' },
  { id: 'face-crown', name: 'Crown', preview: '👑', type: 'crown', color: '#FFD700' },
  { id: 'face-glasses', name: 'Glasses', preview: '🕶️', type: 'glasses', color: '#00D4FF' },
  { id: 'face-mask', name: 'Mask', preview: '🎭', type: 'mask', color: '#9B59B6' },
  { id: 'face-ears', name: 'Cat Ears', preview: '🐱', type: 'ears', color: '#FFB6C1' },
  { id: 'face-hearts', name: 'Hearts', preview: '💕', type: 'hearts', color: '#FF3B7A' },
  { id: 'face-stars', name: 'Stars', preview: '⭐', type: 'stars', color: '#F59E0B' },
  { id: 'face-age', name: 'Aged', preview: '👴', type: 'age', color: '#C4A882' },
  { id: 'face-youth', name: 'Youth', preview: '✨', type: 'youth', color: '#FFC0CB' },
];

export function resolveLiveFaceEffectsEngine(): LiveFaceEffectsEngine {
  const deeparKey = import.meta.env.VITE_DEEPAR_LICENSE_KEY as string | undefined;
  if (deeparKey?.trim()) return 'deepar';
  const banubaKey = import.meta.env.VITE_BANUBA_CLIENT_TOKEN as string | undefined;
  if (banubaKey?.trim()) return 'banuba';
  return 'mediapipe';
}

/** Commercial SDK hooks — returns false until a license key is configured. */
export function isCommercialFaceEngineReady(engine: LiveFaceEffectsEngine): boolean {
  if (engine === 'deepar') {
    return Boolean(String(import.meta.env.VITE_DEEPAR_LICENSE_KEY || '').trim());
  }
  if (engine === 'banuba') {
    return Boolean(String(import.meta.env.VITE_BANUBA_CLIENT_TOKEN || '').trim());
  }
  return true;
}

export function getLiveFaceEngineLabel(): string {
  const engine = resolveLiveFaceEffectsEngine();
  if (engine === 'deepar') return 'DeepAR';
  if (engine === 'banuba') return 'Banuba';
  return 'Face Track';
}
