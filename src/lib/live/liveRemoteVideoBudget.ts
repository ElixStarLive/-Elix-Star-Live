/**
 * Cap remote video decode cost for Live / Battle.
 * adaptiveStream still selects layers by element size; this sets the ceiling
 * under thermal pressure and multi-tile battle so four HIGH streams are never
 * requested when tiles are small or the device is hot.
 */
import { VideoQuality, type Room } from 'livekit-client';
import { getActiveThermalTier, type ThermalTier } from './liveMediaProfile';

export function videoQualityForThermalTier(tier: ThermalTier): VideoQuality {
  switch (tier) {
    case 'critical':
      return VideoQuality.LOW;
    case 'serious':
      return VideoQuality.LOW;
    case 'fair':
      return VideoQuality.MEDIUM;
    default:
      return VideoQuality.HIGH;
  }
}

export function applyRemoteVideoBudget(
  room: Room | null | undefined,
  opts?: { battleRemoteCount?: number },
): void {
  if (!room) return;
  const tier = getActiveThermalTier();
  let quality = videoQualityForThermalTier(tier);
  // 3+ remote battle publishers: never request HIGH for every tile at once.
  // adaptiveStream still downscales further for small/hidden elements.
  const remotes = opts?.battleRemoteCount ?? 0;
  if (remotes >= 3 && quality === VideoQuality.HIGH) {
    quality = VideoQuality.MEDIUM;
  }
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.videoTrackPublications.values()) {
      if (!pub.isSubscribed) continue;
      try {
        pub.setVideoQuality(quality);
      } catch {
        /* older SDK / unsupported */
      }
    }
  }
}
