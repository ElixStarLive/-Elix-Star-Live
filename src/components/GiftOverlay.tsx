import React, { useCallback, useEffect, useRef } from 'react';
import { platform } from '../lib/platform';
import {
  GIFT_OVERLAY_VIDEO_CLASS,
  LIVE_VIDEO_TRANSPARENT_POSTER,
  prepareGiftVideoEl,
} from '../lib/prepareLiveVideoEl';
import { preferPlayableGiftVideoUrl } from '../lib/giftsCatalog';
import { releaseVideoElement } from '../lib/live/liveTrackCleanup';
import type { BattleGiftSide } from '../lib/liveBattleGiftTarget';

/** Fallback only — real end uses video duration so long gifts match wand play-through. */
const GIFT_SAFETY_MAX_MS = 30_000;

function isGiftVideoUrl(src: string): boolean {
  const path = src.split('?')[0].toLowerCase();
  return path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.mov');
}

interface GiftOverlayProps {
  videoSrc: string | null;
  previewSrc?: string | null;
  onEnded: () => void;
  /** Accepted for API parity; battle gifts use the same chat-anchored frame as solo live. */
  isBattleMode?: boolean;
  /** Kept for callers; does not half-pane the video (owner: play on chat like normal live). */
  battleSide?: BattleGiftSide | null;
  /** When false, spectators can hear the gift video sound. Default true (muted) for creator/autoplay. */
  muted?: boolean;
  /** Stacking order. Spectator should keep this below combo/gift icons. */
  zIndex?: number;
}

function GiftVideo({
  videoSrc,
  muted,
  onEnded,
  onDurationMs,
  className = 'absolute inset-0 w-full h-full object-cover drop-shadow-2xl',
}: {
  videoSrc: string;
  muted: boolean;
  onEnded: () => void;
  onDurationMs?: (ms: number) => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onDurationMsRef = useRef(onDurationMs);
  onDurationMsRef.current = onDurationMs;

  const bindVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (!el) return;
      prepareGiftVideoEl(el, { muted: true });
    },
    [],
  );

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    prepareGiftVideoEl(el, { muted: true });

    const reportDuration = () => {
      const d = el.duration;
      const report = onDurationMsRef.current;
      if (typeof report === 'function' && Number.isFinite(d) && d > 0) {
        report(Math.min(Math.ceil(d * 1000) + 400, GIFT_SAFETY_MAX_MS));
      }
    };
    el.addEventListener('loadedmetadata', reportDuration);
    if (el.readyState >= 1) reportDuration();

    let finished = false;
    const endAndRelease = () => {
      if (finished) return;
      finished = true;
      releaseVideoElement(el);
      onEndedRef.current();
    };

    const tryPlay = () => {
      const p = el.play();
      if (!p || typeof p.then !== 'function') return;
      p.then(() => {
        el.style.visibility = 'visible';
        // Android WebView: unmute-after-play paints a stuck white play icon.
        if (!muted && !platform.isAndroid) {
          el.muted = false;
        }
      }).catch(() => {
        el.muted = true;
        el.style.visibility = 'visible';
        void el.play().catch(() => {});
      });
    };
    if (el.readyState >= 2) tryPlay();
    else el.addEventListener('loadeddata', tryPlay, { once: true });

    const onNativeEnded = () => endAndRelease();
    el.addEventListener('ended', onNativeEnded);
    el.addEventListener('error', onNativeEnded);

    return () => {
      el.removeEventListener('loadeddata', tryPlay);
      el.removeEventListener('loadedmetadata', reportDuration);
      el.removeEventListener('ended', onNativeEnded);
      el.removeEventListener('error', onNativeEnded);
      // Release decoder even if parent clears currentGift without waiting for ended.
      releaseVideoElement(el);
    };
  }, [videoSrc, muted]);

  return (
    <video
      ref={bindVideo}
      key={videoSrc}
      src={videoSrc}
      className={`${className} ${GIFT_OVERLAY_VIDEO_CLASS} pointer-events-none`}
      style={{ pointerEvents: 'none', objectFit: 'cover', objectPosition: 'center' }}
      playsInline
      autoPlay
      muted
      controls={false}
      poster={LIVE_VIDEO_TRANSPARENT_POSTER}
      preload="auto"
    />
  );
}

export function GiftOverlay({
  videoSrc,
  previewSrc: _previewSrc,
  onEnded,
  isBattleMode: _isBattleMode = false,
  battleSide: _battleSide = null,
  muted = true,
  zIndex = 50000,
}: GiftOverlayProps) {
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  /** Same MP4 preference as Celestial Star Wand catalog path — every gift. */
  const rawPlaySrc = videoSrc ? preferPlayableGiftVideoUrl(videoSrc) : null;
  const playSrc = rawPlaySrc && isGiftVideoUrl(rawPlaySrc) ? rawPlaySrc : null;

  const armSafety = useCallback((ms: number) => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = setTimeout(() => {
      safetyTimerRef.current = null;
      onEndedRef.current();
    }, Math.max(1000, Math.min(ms, GIFT_SAFETY_MAX_MS)));
  }, []);

  // Non-video assets (icon-only gifts) have nothing to play — release the slot
  // so the queue advances instead of stalling on the safety timer.
  useEffect(() => {
    if (!rawPlaySrc || playSrc) return;
    onEndedRef.current();
  }, [rawPlaySrc, playSrc]);

  /**
   * The <video> element owns readiness: it mounts immediately and plays on
   * `loadeddata`. Gating the mount on a full `canplaythrough` preload dropped
   * every gift on spectators, whose downlink is already carrying the live
   * stream, because the safety timer fired before the clip finished buffering.
   */
  useEffect(() => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    if (!playSrc) return;

    armSafety(8000);

    return () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, [playSrc, armSafety]);

  const handleEnded = useCallback(() => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    onEndedRef.current();
  }, []);

  if (!playSrc) return null;

  // Solo + battle: identical Celestial Star Wand frame — over chat / MVP / lower battle.
  return (
    <div
      className="fixed left-0 right-0 mx-auto w-full max-w-[480px] pointer-events-none overflow-hidden"
      data-elix-gift-overlay="true"
      style={{
        bottom: 0,
        height: 'calc(70% - 25mm)',
        zIndex,
        WebkitMaskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
        maskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
      }}
    >
      <div className="absolute inset-0">
        <GiftVideo
          videoSrc={playSrc}
          muted={muted}
          onEnded={handleEnded}
          onDurationMs={armSafety}
        />
      </div>
    </div>
  );
}
