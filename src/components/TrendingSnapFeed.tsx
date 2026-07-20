import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import type { Video } from '../store/useVideoStore';
import { getVideoPosterUrl, resolveGridThumbnailUrl, resolveVideoPlaybackUrl } from '../lib/bunnyStorage';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** True when the still looks like a black / empty first frame. */
function isNearlyBlackImage(img: HTMLImageElement): boolean {
  try {
    const canvas = document.createElement('canvas');
    const w = 10;
    const h = 10;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let total = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      total += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return total / pixels < 14;
  } catch {
    // CORS-tainted canvas — cannot inspect; keep the image.
    return false;
  }
}

function VideoThumbnail({ video }: { video: Video }) {
  const navigate = useNavigate();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [hideImg, setHideImg] = React.useState(false);
  const playbackUrl = resolveVideoPlaybackUrl(video.url || '');
  const poster = resolveGridThumbnailUrl(video.thumbnail, video.url || '');
  const bunnyPoster = getVideoPosterUrl(video.url || '');
  const showImg = Boolean(poster) && !hideImg;
  // Media fragment skips the common black intro frame (same idea as Profile grid).
  const videoSrc = playbackUrl ? `${playbackUrl}#t=0.8` : '';

  const handleImgError = React.useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (!img.dataset.fallback && bunnyPoster && img.src !== bunnyPoster) {
        img.dataset.fallback = '1';
        img.src = bunnyPoster;
        return;
      }
      setHideImg(true);
    },
    [bunnyPoster],
  );

  const handleImgLoad = React.useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (isNearlyBlackImage(e.currentTarget)) {
      setHideImg(true);
    }
  }, []);

  // When the still is missing/black, paint a real frame from the video.
  const paintContentFrame = React.useCallback((vid: HTMLVideoElement) => {
    try {
      const dur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0;
      const target = dur > 0 ? Math.min(Math.max(dur * 0.2, 0.8), 3) : 0.8;
      if (Math.abs(vid.currentTime - target) > 0.05) {
        vid.currentTime = target;
      }
    } catch {
      /* seek unsupported */
    }
    const played = vid.play?.();
    if (played && typeof played.then === 'function') {
      played
        .then(() => {
          window.setTimeout(() => {
            try {
              vid.pause();
            } catch {
              /* ignore */
            }
          }, 80);
        })
        .catch(() => {
          /* autoplay blocked — #t= fragment is the fallback */
        });
    }
  }, []);

  React.useEffect(() => {
    if (showImg || !videoRef.current) return;
    const vid = videoRef.current;
    const onReady = () => paintContentFrame(vid);
    if (vid.readyState >= 2) {
      onReady();
      return;
    }
    vid.addEventListener('loadeddata', onReady, { once: true });
    return () => vid.removeEventListener('loadeddata', onReady);
  }, [showImg, videoSrc, paintContentFrame]);

  return (
    <button
      type="button"
      className="relative aspect-[3/4] bg-black rounded-lg overflow-hidden cursor-pointer group"
      onClick={() => navigate(`/video/${video.id}`)}
    >
      {/* Video underlay — shows when still is missing, broken, or nearly black */}
      {videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          poster={showImg ? poster : undefined}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition pointer-events-none"
          aria-hidden
        />
      ) : null}

      {showImg ? (
        <img
          src={poster}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition pointer-events-none"
          loading="lazy"
          decoding="async"
          onError={handleImgError}
          onLoad={handleImgLoad}
        />
      ) : null}

      {!videoSrc && !showImg ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Play size={24} className="text-white/30" />
        </div>
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-col items-start gap-0.5">
        <Play size={10} fill="white" className="text-white drop-shadow-md" />
        <span className="text-[10px] font-bold text-white drop-shadow-md leading-none">
          {formatNumber(video.stats?.views || 0)}
        </span>
        <span className="text-[9px] text-white/80 truncate max-w-full leading-none">
          @{video.user?.username || 'user'}
        </span>
      </div>
    </button>
  );
}

export function TrendingSnapFeed({ videos }: { videos: Video[] }) {
  if (videos.length === 0) {
    return (
      <div className="text-xs text-white/30 py-3 px-4 text-center w-full">
        No videos yet.
      </div>
    );
  }

  return (
    <div className="w-full px-3 pb-4">
      <div className="grid grid-cols-3 gap-1.5">
        {videos.map((video) => (
          <VideoThumbnail key={video.id} video={video} />
        ))}
      </div>
    </div>
  );
}
