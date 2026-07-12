import React, { useEffect, useRef, useState } from 'react';

const MAX_CACHE = 20;
const videoCache = new Map<string, string>();

function preloadVideo(src: string): Promise<string> {
  if (videoCache.has(src)) return Promise.resolve(videoCache.get(src)!);
  return new Promise((resolve, reject) => {
    const vid = document.createElement('video');
    vid.preload = 'auto';
    vid.muted = true;
    vid.playsInline = true;
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
  /** @deprecated Gift video never splits onto battle/co-host panes. */
  splitSides?: boolean;
  /** @deprecated */
  splitStyle?: React.CSSProperties;
  isBattleMode?: boolean;
  /** When false, spectators can hear the gift video sound. Default true (muted) for creator/autoplay. */
  muted?: boolean;
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

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    const tryPlay = () => {
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.catch(() => {
          // Autoplay with sound often blocked — still play the video muted.
          el.muted = true;
          el.play().catch(() => onEnded());
        });
      }
    };
    if (el.readyState >= 2) tryPlay();
    else el.addEventListener('loadeddata', tryPlay, { once: true });
    return () => el.removeEventListener('loadeddata', tryPlay);
  }, [videoSrc, muted, onEnded]);

  return (
    <video
      ref={videoRef}
      key={videoSrc}
      src={videoSrc}
      className={className}
      playsInline
      autoPlay
      muted={muted}
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
  splitSides: _splitSides = false,
  splitStyle: _splitStyle,
  isBattleMode: _isBattleMode,
  muted = true,
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
    const isVideo = path.endsWith('.mp4') || path.endsWith('.webm');

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
        .catch(() => {
          if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
          onEndedRef.current();
        });
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

  return (
    <div
      className="fixed left-0 right-0 bottom-0 mx-auto w-full max-w-[480px] pointer-events-none overflow-hidden"
      style={{
        height: 'calc(70% - 25mm)',
        zIndex: 210,
        WebkitMaskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
        maskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
      }}
    >
      <GiftVideo videoSrc={videoSrc} muted={muted} onEnded={handleEnded} />
    </div>
  );
}
