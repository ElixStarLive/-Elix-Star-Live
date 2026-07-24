import React, { useEffect, useRef, useState } from 'react';
import { platform } from '../lib/platform';

const MAX_CACHE = 20;
const videoCache = new Map<string, string>();

/** Android WebView often cannot decode VP9/WebM — prefer MP4 sibling when available. */
function androidPlayableSrc(src: string): string {
  if (!platform.isAndroid) return src;
  if (/\.webm(\?|#|$)/i.test(src)) {
    return src.replace(/\.webm(\?|#|$)/i, '.mp4$1');
  }
  return src;
}

function preloadVideo(src: string): Promise<string> {
  const playSrc = androidPlayableSrc(src);
  if (videoCache.has(playSrc)) return Promise.resolve(videoCache.get(playSrc) as string);
  return new Promise((resolve, reject) => {
    const vid = document.createElement('video');
    vid.preload = 'auto';
    vid.muted = true;
    vid.playsInline = true;
    vid.setAttribute('playsinline', 'true');
    vid.setAttribute('webkit-playsinline', 'true');
    let settled = false;
    const finishOk = () => {
      if (settled) return;
      settled = true;
      vid.oncanplaythrough = null;
      vid.onloadeddata = null;
      vid.onerror = null;
      if (videoCache.size >= MAX_CACHE) {
        const first = videoCache.keys().next().value;
        if (first) videoCache.delete(first);
      }
      videoCache.set(playSrc, playSrc);
      resolve(playSrc);
    };
    const finishErr = () => {
      if (settled) return;
      settled = true;
      vid.oncanplaythrough = null;
      vid.onloadeddata = null;
      vid.onerror = null;
      reject(new Error('preload failed'));
    };
    vid.oncanplaythrough = finishOk;
    vid.onloadeddata = finishOk;
    vid.onerror = finishErr;
    // Don't leave Android hanging forever on preload.
    window.setTimeout(() => {
      if (!settled) finishOk();
    }, 2500);
    vid.src = playSrc;
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
  className = 'absolute inset-0 w-full h-full object-contain drop-shadow-2xl',
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
  const playSrc = androidPlayableSrc(videoSrc);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    setVisible(false);
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      onEnded();
    };
    // Always start muted so Android/iOS WebViews allow autoplay; unmute after
    // playback starts when the caller requested sound.
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    el.setAttribute('x5-playsinline', 'true');
    el.setAttribute('x5-video-player-type', 'h5');
    el.setAttribute('x5-video-player-fullscreen', 'false');
    el.disablePictureInPicture = true;
    const reveal = () => {
      setVisible(true);
      // #region agent log
      fetch('http://127.0.0.1:7293/ingest/e7fb8ad3-ac4d-422a-955a-8c318a5cd9e2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fa77db'},body:JSON.stringify({sessionId:'fa77db',runId:'post-fix',hypothesisId:'H-gift',location:'GiftOverlay.tsx:reveal',message:'gift overlay revealed (opacity only)',data:{hasHideHelper:false},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    };
    const tryPlay = () => {
      el.muted = true;
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          reveal();
          if (!muted) {
            try {
              el.muted = false;
            } catch {
              /* keep muted */
            }
          }
        }).catch(() => {
          el.muted = true;
          el.play().then(reveal).catch(() => {
            // Last resort: show frame anyway so gift is not a black hole.
            reveal();
            window.setTimeout(finish, 1200);
          });
        });
      } else {
        reveal();
      }
    };
    el.addEventListener('playing', reveal, { once: true });
    el.addEventListener('loadeddata', tryPlay, { once: true });
    el.addEventListener('canplay', tryPlay, { once: true });
    if (el.readyState >= 2) tryPlay();
    // If play never starts (Android quirk), still reveal briefly then end.
    const watchdog = window.setTimeout(() => {
      if (!ended) {
        reveal();
        tryPlay();
      }
    }, 600);
    return () => {
      window.clearTimeout(watchdog);
      el.removeEventListener('loadeddata', tryPlay);
      el.removeEventListener('canplay', tryPlay);
      el.removeEventListener('playing', reveal);
    };
  }, [playSrc, muted, onEnded]);

  return (
    <video
      ref={videoRef}
      key={playSrc}
      src={playSrc}
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
      onError={() => {
        // One retry with original src if mp4 sibling failed (or vice versa).
        const el = videoRef.current;
        if (el && playSrc !== videoSrc && el.src.includes('.mp4')) {
          el.src = videoSrc;
          el.load();
          void el.play().catch(() => onEnded());
          return;
        }
        onEnded();
      }}
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
    }, 12000);

    const path = videoSrc.split('?')[0].toLowerCase();
    const isVideo = path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.mov');

    if (!isVideo) {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      onEndedRef.current();
      return;
    }

    const playSrc = androidPlayableSrc(videoSrc);
    if (videoCache.has(playSrc)) {
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
        // CSS mask blanks gift videos on many Android WebViews — keep mask off Android.
        ...(platform.isAndroid
          ? {}
          : {
              WebkitMaskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
              maskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
            }),
      }}
    >
      <GiftVideo videoSrc={videoSrc} muted={muted} onEnded={handleEnded} />
    </div>
  );
}
