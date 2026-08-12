import { describe, expect, it, vi } from 'vitest';
import { VideoQuality } from 'livekit-client';
import { applyRemoteVideoBudget, videoQualityForThermalTier } from './liveRemoteVideoBudget';
import { getLiveRoomOptions, setActiveThermalTier } from './liveMediaProfile';

describe('live thermal / remote video budget', () => {
  it('maps thermal tiers to VideoQuality ceilings', () => {
    expect(videoQualityForThermalTier('nominal')).toBe(VideoQuality.HIGH);
    expect(videoQualityForThermalTier('fair')).toBe(VideoQuality.MEDIUM);
    expect(videoQualityForThermalTier('serious')).toBe(VideoQuality.LOW);
    expect(videoQualityForThermalTier('critical')).toBe(VideoQuality.LOW);
  });

  it('room options enable adaptiveStream + dynacast', () => {
    const opts = getLiveRoomOptions();
    expect(opts.dynacast).toBe(true);
    expect(opts.adaptiveStream).toBeTruthy();
    if (typeof opts.adaptiveStream === 'object') {
      expect(opts.adaptiveStream.pauseVideoInBackground).toBe(true);
      expect(opts.adaptiveStream.pixelDensity).toBe(1);
    }
  });

  it("4-creator battle caps HIGH to MEDIUM at nominal", () => {
    setActiveThermalTier("nominal");
    const setVideoQuality = vi.fn();
    const room = {
      remoteParticipants: new Map([
        [
          "a",
          {
            videoTrackPublications: new Map([
              ["v", { isSubscribed: true, setVideoQuality }],
            ]),
          },
        ],
      ]),
    } as unknown as import("livekit-client").Room;
    applyRemoteVideoBudget(room, { battleRemoteCount: 3 });
    expect(setVideoQuality).toHaveBeenCalledWith(VideoQuality.MEDIUM);
  });
});
