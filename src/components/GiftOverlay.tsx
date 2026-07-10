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
  /** Play gift video on left + right video panes (battle / co-host split). */
  splitSides?: boolean;
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
      onLoadedData={() => {
        if (videoRef.current?.paused) {
          videoRef.current.play().catch(() => {});
        }
      }}
      onEnded={onEnded}
      onError={onEnded}
    />
  );
}

export function GiftOverlay({
  videoSrc,
  previewSrc: _previewSrc,
  onEnded,
  splitSides = false,
  splitStyle,
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

  if (splitSides) {
    const regionStyle: React.CSSProperties = {
      top: 'calc(env(safe-area-inset-top, 0px) + 90px)',
      height: 'calc(36dvh + 10mm)',
      zIndex: 210,
      ...splitStyle,
    };

    return (
      <div
        className="fixed left-0 right-0 mx-auto w-full max-w-[480px] pointer-events-none overflow-hidden flex flex-row"
        style={regionStyle}
      >
        <div className="relative w-1/2 h-full overflow-hidden">
          <GiftVideo videoSrc={videoSrc} muted={muted} onEnded={handleEnded} />
        </div>
        <div className="relative w-1/2 h-full overflow-hidden">
          <GiftVideo videoSrc={videoSrc} muted={muted} onEnded={() => {}} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed left-0 right-0 bottom-0 mx-auto w-full max-w-[480px] pointer-events-none overflow-hidden"
      style={{
        height: '70%',
        zIndex: 210,
        WebkitMaskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
        maskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
      }}
    >
      <GiftVideo videoSrc={videoSrc} muted={muted} onEnded={handleEnded} />
    </div>
  );
}
