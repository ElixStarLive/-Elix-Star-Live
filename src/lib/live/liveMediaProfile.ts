/**
 * Single owner for Live capture / publish / room options.
 * Thermal tiers adjust cost without changing UI layout.
 */
import { VideoPresets, type RoomOptions, type VideoCaptureOptions } from 'livekit-client';

export type ThermalTier = 'nominal' | 'fair' | 'serious' | 'critical';

type LiveMediaTierConfig = {
  tier: ThermalTier;
  capture: MediaTrackConstraints;
  publishPreset: (typeof VideoPresets)[keyof typeof VideoPresets];
  /** Reduce decorative GPU work (particles, heavy CSS animations). */
  reduceDecorativeMotion: boolean;
};

const BASE_VIDEO_CAPTURE: MediaTrackConstraints = {
  facingMode: 'user',
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 30, max: 30 },
};

const TIER_CONFIG: Record<ThermalTier, Omit<LiveMediaTierConfig, 'tier'>> = {
  nominal: {
    capture: BASE_VIDEO_CAPTURE,
    publishPreset: VideoPresets.h720,
    reduceDecorativeMotion: false,
  },
  // Android reports MODERATE (status 2) as this tier, so it is the first tier
  // that has to shed real encode cost: publishing h720/30 here meant nothing
  // dropped until SEVERE, by which point the SoC is already throttling and the
  // handset keeps climbing. Halving the pixels cuts encode work ~44% while
  // holding 30fps, because choppy motion is more visible to viewers than a
  // resolution step on a phone-sized tile.
  fair: {
    capture: {
      facingMode: 'user',
      width: { ideal: 960, max: 960 },
      height: { ideal: 540, max: 540 },
      frameRate: { ideal: 30, max: 30 },
    },
    publishPreset: VideoPresets.h540,
    reduceDecorativeMotion: true,
  },
  serious: {
    capture: {
      facingMode: 'user',
      width: { ideal: 960, max: 960 },
      height: { ideal: 540, max: 540 },
      frameRate: { ideal: 24, max: 24 },
    },
    publishPreset: VideoPresets.h540,
    reduceDecorativeMotion: true,
  },
  critical: {
    capture: {
      facingMode: 'user',
      width: { ideal: 640, max: 640 },
      height: { ideal: 360, max: 360 },
      frameRate: { ideal: 15, max: 15 },
    },
    publishPreset: VideoPresets.h360,
    reduceDecorativeMotion: true,
  },
};

let activeTier: ThermalTier = 'nominal';

export function getActiveThermalTier(): ThermalTier {
  return activeTier;
}

export function getLiveMediaTierConfig(tier: ThermalTier = activeTier): LiveMediaTierConfig {
  return { tier, ...TIER_CONFIG[tier] };
}

export function setActiveThermalTier(tier: ThermalTier): LiveMediaTierConfig {
  activeTier = tier;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.elixThermalTier = tier;
    document.documentElement.dataset.elixReduceMotion =
      TIER_CONFIG[tier].reduceDecorativeMotion ? 'true' : 'false';
  }
  return getLiveMediaTierConfig(tier);
}

/** LiveKit Room — one options object for every connect path. */
export function getLiveRoomOptions(): RoomOptions {
  const cfg = getLiveMediaTierConfig();
  return {
    // Pause hidden tracks; select layers from rendered element size (battle tiles).
    adaptiveStream: {
      pixelDensity: 1,
      pauseVideoInBackground: true,
    },
    dynacast: true,
    stopLocalTrackOnUnpublish: false,
    videoCaptureDefaults: toLiveKitCaptureOptions('user', cfg.tier),
    publishDefaults: {
      simulcast: true,
      videoEncoding: cfg.publishPreset.encoding,
      degradationPreference: 'balanced',
    },
  };
}

export function buildCameraGetUserMediaVideoConstraints(
  facing: 'user' | 'environment',
  tier: ThermalTier = activeTier,
): MediaTrackConstraints {
  const cap = getLiveMediaTierConfig(tier).capture;
  return {
    ...cap,
    facingMode: facing,
  };
}

function toLiveKitCaptureOptions(
  facing: 'user' | 'environment',
  tier: ThermalTier = activeTier,
): VideoCaptureOptions {
  const cap = buildCameraGetUserMediaVideoConstraints(facing, tier);
  const width = cap.width as ConstrainULongRange | undefined;
  const height = cap.height as ConstrainULongRange | undefined;
  const frameRate = cap.frameRate as ConstrainDoubleRange | undefined;
  return {
    facingMode: facing,
    resolution: {
      width: typeof width?.ideal === 'number' ? width.ideal : 1280,
      height: typeof height?.ideal === 'number' ? height.ideal : 720,
      frameRate: typeof frameRate?.max === 'number' ? frameRate.max : 30,
    },
  };
}

export async function applyCaptureTierToVideoTrack(
  track: MediaStreamTrack | null | undefined,
  facing: 'user' | 'environment',
  tier: ThermalTier = activeTier,
): Promise<void> {
  if (!track || track.readyState !== 'live') return;
  const constraints = buildCameraGetUserMediaVideoConstraints(facing, tier);
  try {
    await track.applyConstraints(constraints);
  } catch {
    /* device may not support down-tier — keep current capture */
  }
}

/**
 * Live publish/preview must not keep Create's unconstrained (often 1080p/60)
 * capture. Apply the current Live tier to every live video track on the stream.
 */
export async function enforceLiveCaptureOnStream(
  stream: MediaStream | null | undefined,
  facing: 'user' | 'environment',
  tier: ThermalTier = activeTier,
): Promise<void> {
  if (!stream) return;
  const tracks = stream.getVideoTracks().filter((t) => t.readyState === 'live');
  for (const track of tracks) {
    await applyCaptureTierToVideoTrack(track, facing, tier);
  }
}
