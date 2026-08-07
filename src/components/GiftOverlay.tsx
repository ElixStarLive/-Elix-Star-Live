import React, { useCallback, useEffect, useRef, useState } from 'react';
import { platform } from '../lib/platform';
import {
  GIFT_OVERLAY_VIDEO_CLASS,
  LIVE_VIDEO_TRANSPARENT_POSTER,
  prepareGiftVideoEl,
  stripVideoMediaChrome,
} from '../lib/prepareLiveVideoEl';
import { LIVE_BATTLE_VIDEO_HEIGHT } from '../lib/profileFrame';
import type { BattleGiftSide } from '../lib/liveBattleGiftTarget';

const MAX_CACHE = 20;
const videoCache = new Map<string, string>();

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

interface GiftOverlayProps {
  videoSrc: string | null;
  previewSrc?: string | null;
  onEnded: () => void;
  isBattleMode?: boolean;
  /** In battle: play big gift only on receiving side (host=left/red, opponent=right/blue). */
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
  className = 'absolute inset-0 w-full h-full object-cover drop-shadow-2xl',
}: {
  videoSrc: string;
  muted: boolean;
  onEnded: () => void;
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
    return () => el.removeEventListener('loadeddata', tryPlay);
  }, [videoSrc, muted, onEnded]);

  return (
    <video
      ref={bindVideo}
      key={videoSrc}
      src={videoSrc}
      className={`${className} ${GIFT_OVERLAY_VIDEO_CLASS} pointer-events-none`}
      style={{ pointerEvents: 'none' }}
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
  isBattleMode = false,
  battleSide = null,
  muted = true,
  zIndex = 50000,
}: GiftOverlayProps) {
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    if (!videoSrc) return;

    setVideoReady(false);

    safetyTimerRef.current = setTimeout(() => {
      onEndedRef.current();
    }, 8000);

    const path = videoSrc.split('?')[0].toLowerCase();
    const isVideo = path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.mov');

    if (!isVideo) {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      onEndedRef.current();
      return;
    }

    if (videoCache.has(videoSrc)) {
      setVideoReady(true);
    } else {
      preloadVideo(videoSrc)
        .then(() => setVideoReady(true))
        .catch(() => setVideoReady(true));
    }

    return () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, [videoSrc]);

  const handleEnded = () => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    onEnded();
  };

  if (!videoSrc || !videoReady) return null;

  const sideScoped = !!(isBattleMode && battleSide);

  return (
    <div
      className="fixed left-0 right-0 mx-auto w-full max-w-[480px] pointer-events-none overflow-hidden"
      style={
        sideScoped
          ? {
              top: 'calc(env(safe-area-inset-top, 0px) + 90px)',
              height: LIVE_BATTLE_VIDEO_HEIGHT,
              zIndex,
            }
          : {
              bottom: 0,
              height: 'calc(70% - 25mm)',
              zIndex,
              WebkitMaskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
              maskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
            }
      }
    >
      <div
        className={sideScoped ? 'absolute top-0 bottom-0 w-1/2 overflow-hidden' : 'absolute inset-0'}
        style={sideScoped ? { left: battleSide === 'host' ? 0 : '50%' } : undefined}
      >
        <GiftVideo
          videoSrc={videoSrc}
          muted={muted}
          onEnded={handleEnded}
          className="absolute inset-0 w-full h-full object-contain drop-shadow-2xl"
        />
      </div>
    </div>
  );
}
