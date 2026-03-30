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
  isBattleMode?: boolean;
  /** When false, spectators can hear the gift video sound. Default true (muted) for creator/autoplay. */
  muted?: boolean;
}

export function GiftOverlay({ videoSrc, previewSrc: _previewSrc, onEnded, isBattleMode: _isBattleMode, muted = true }: GiftOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
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

    return () => { if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current); };
  }, [videoSrc]);

  if (!videoSrc || !videoReady) return null;

  return (
    <div
      className="absolute left-0 right-0 bottom-0 pointer-events-none overflow-hidden"
      style={{
        height: '70%',
        zIndex: 95,
        WebkitMaskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
        maskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
      }}
    >
      <video
        ref={videoRef}
        key={videoSrc}
        src={videoSrc}
        className="absolute inset-0 w-full h-full object-cover drop-shadow-2xl"
        playsInline
        autoPlay
        muted={muted}
        preload="auto"
        onLoadedData={() => {
          if (videoRef.current?.paused) {
            videoRef.current.play().catch(() => {});
          }
        }}
        onEnded={() => {
          if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
          onEnded();
        }}
        onError={() => {
          if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
          onEnded();
        }}
      />
    </div>
  );
}
