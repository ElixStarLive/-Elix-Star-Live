import React, { useEffect, useRef, useState } from 'react';

const MAX_CACHE = 20;
const videoCache = new Map<string, string>();

function preloadVideo(src: string): Promise<string> {
  if (videoCache.has(src)) return Promise.resolve(videoCache.get(src) as NonNullable<ReturnType<typeof videoCache.get>>);
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
  /** Stacking order. Spectator should keep this below combo/gift icons. */
  zIndex?: number;
}

/** 1×1 transparent GIF — avoids Android WebView default poster / white play icon. */
const TRANSPARENT_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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
  // Keep invisible until playback starts — Android Capacitor WebView otherwise
  // flashes the system white play button before the first decoded frame.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    setVisible(false);
    // Always start muted so Android/iOS WebViews allow autoplay; unmute after
    // playback starts when the caller requested sound.
    el.muted = true;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    el.setAttribute('x5-playsinline', 'true');
    el.setAttribute('x5-video-player-type', 'h5');
    el.setAttribute('x5-video-player-fullscreen', 'false');
    el.disablePictureInPicture = true;
    const reveal = () => setVisible(true);
    const tryPlay = () => {
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          reveal();
          if (!muted) {
            el.muted = false;
          }
        }).catch(() => {
          el.muted = true;
          el.play().then(reveal).catch(() => onEnded());
        });
      }
    };
    el.addEventListener('playing', reveal, { once: true });
    if (el.readyState >= 2) tryPlay();
    else el.addEventListener('loadeddata', tryPlay, { once: true });
    return () => {
      el.removeEventListener('loadeddata', tryPlay);
      el.removeEventListener('playing', reveal);
    };
  }, [videoSrc, muted, onEnded]);

  return (
    <video
      ref={videoRef}
      key={videoSrc}
      src={videoSrc}
      className={`gift-overlay-video ${className} pointer-events-none`}
      style={{
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        backgroundColor: 'transparent',
      }}
      playsInline
      autoPlay
      muted
      controls={false}
      controlsList="nodownload nofullscreen noremoteplayback"
      disablePictureInPicture
      poster={TRANSPARENT_POSTER}
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
      // Preload is best-effort. On failure still try native playback — a failed
      // preload (CORS / WebView) must not skip the gift video on the creator page.
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

  return (
    <div
      className="fixed left-0 right-0 bottom-0 mx-auto w-full max-w-[480px] pointer-events-none overflow-hidden"
      style={{
        height: 'calc(70% - 25mm)',
        // Default high; spectator passes a lower zIndex so combo/gift icons stay on top.
        zIndex,
        WebkitMaskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
        maskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
      }}
    >
      <GiftVideo videoSrc={videoSrc} muted={muted} onEnded={handleEnded} />
    </div>
  );
}
