import React, { useCallback, useEffect, useRef, useState } from 'react';
import { platform } from '../lib/platform';
import {
  GIFT_OVERLAY_VIDEO_CLASS,
  LIVE_VIDEO_TRANSPARENT_POSTER,
  prepareGiftVideoEl,
  stripVideoMediaChrome,
} from '../lib/prepareLiveVideoEl';
import { preferPlayableGiftVideoUrl } from '../lib/giftsCatalog';
import type { BattleGiftSide } from '../lib/liveBattleGiftTarget';

const MAX_CACHE = 20;
const videoCache = new Map<string, string>();
/** Fallback only — real end uses video duration so long gifts match wand play-through. */
const GIFT_SAFETY_MAX_MS = 30_000;

function preloadVideo(src: string): Promise<string> {
  if (videoCache.has(src)) return Promise.resolve(videoCache.get(src) as NonNullable<ReturnType<typeof videoCache.get>>);
  return new Promise((resolve, reject) => {
    const vid = document.createElement('video');
    vid.preload = 'auto';
    vid.muted = true;
    vid.playsInline = true;
    stripVideoMediaChrome(vid);
    vid.oncanplaythrough = () => {
      vid.oncanplaythrough = null;
      vid.onerror = null;
      vid.src = '';
      vid.load();
      if (videoCache.size >= MAX_CACHE) {
        const first = videoCache.keys().next().value;
        if (first) videoCache.delete(first);
      }
      videoCache.set(src, src);
      resolve(src);
    };
    vid.onerror = () => {
      vid.oncanplaythrough = null;
      vid.onerror = null;
      vid.src = '';
      reject(new Error('preload failed'));
    };
    vid.src = src;
    vid.load();
  });
}

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
      if (typeof onDurationMs === 'function' && Number.isFinite(d) && d > 0) {
        onDurationMs(Math.min(Math.ceil(d * 1000) + 400, GIFT_SAFETY_MAX_MS));
      }
    };
    el.addEventListener('loadedmetadata', reportDuration);
    if (el.readyState >= 1) reportDuration();

    const tryPlay = () => {
      const p = el.play();
      if (!p || typeof p.then !== 'function') return;
      p.then(() => {
        // Android WebView: unmute-after-play paints a stuck white play icon.
        if (!muted && !platform.isAndroid) {
          el.muted = false;
        }
      }).catch(() => {
        el.muted = true;
        el.play().catch(() => onEnded());
      });
    };
    if (el.readyState >= 2) tryPlay();
    else el.addEventListener('loadeddata', tryPlay, { once: true });
    return () => {
      el.removeEventListener('loadeddata', tryPlay);
      el.removeEventListener('loadedmetadata', reportDuration);
    };
  }, [videoSrc, muted, onEnded, onDurationMs]);

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
      onEnded={onEnded}
      onError={onEnded}
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

  const [videoReady, setVideoReady] = useState(false);
  /** Same MP4 preference as Celestial Star Wand catalog path — every gift. */
  const playSrc = videoSrc ? preferPlayableGiftVideoUrl(videoSrc) : null;

  const armSafety = useCallback((ms: number) => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = setTimeout(() => {
      safetyTimerRef.current = null;
      onEndedRef.current();
    }, Math.max(1000, Math.min(ms, GIFT_SAFETY_MAX_MS)));
  }, []);

  useEffect(() => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    if (!playSrc) return;

    setVideoReady(false);
    armSafety(8000);

    if (!isGiftVideoUrl(playSrc)) {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      onEndedRef.current();
      return;
    }

    if (videoCache.has(playSrc)) {
      setVideoReady(true);
    } else {
      preloadVideo(playSrc)
        .then(() => setVideoReady(true))
        .catch(() => setVideoReady(true));
    }

    return () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, [playSrc, armSafety]);

  const handleEnded = () => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    onEnded();
  };

  if (!playSrc || !videoReady) return null;

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
