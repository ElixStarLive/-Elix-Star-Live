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

function VideoThumbnail({ video }: { video: Video }) {
  const navigate = useNavigate();
  const [imgFailed, setImgFailed] = React.useState(false);
  const playbackUrl = resolveVideoPlaybackUrl(video.url || '');
  const poster = resolveGridThumbnailUrl(video.thumbnail, video.url || '');
  const bunnyPoster = getVideoPosterUrl(video.url || '');
  const showImg = Boolean(poster) && !imgFailed;

  const handleImgError = React.useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (!img.dataset.fallback && bunnyPoster && img.src !== bunnyPoster) {
        img.dataset.fallback = '1';
        img.src = bunnyPoster;
        return;
      }
      setImgFailed(true);
    },
    [bunnyPoster],
  );

  // For tiles without a still thumbnail we render the <video> and freeze a frame.
  // The first ~0.5s is usually a black fade-in / encoder frame, so seek a bit into
  // the clip where real content is visible — otherwise the tile looks "black".
  const seekToContentFrame = React.useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const vid = e.currentTarget;
      try {
        const dur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0;
        const target = dur > 0 ? Math.min(Math.max(dur * 0.15, 0.7), 3) : 0.7;
        if (Math.abs(vid.currentTime - target) > 0.05) vid.currentTime = target;
      } catch {
        /* seek unsupported — the play/pause fallback below handles it */
      }
    },
    [],
  );

  // Some WebViews won't paint a seeked frame until playback happens, so if the
  // seek didn't advance, nudge with a brief muted play → pause.
  const paintFirstFrame = React.useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const vid = e.currentTarget;
      if (vid.currentTime > 0.05) return; // seeked frame already painted
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
            }, 60);
          })
          .catch(() => {
            /* autoplay blocked — the seek is the fallback */
          });
      }
    },
    [],
  );

  return (
    <button
      type="button"
      className="relative aspect-[3/4] bg-black rounded-lg overflow-hidden cursor-pointer group"
      onClick={() => navigate(`/video/${video.id}`)}
    >
      {showImg ? (
        <img
          src={poster}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
          loading="lazy"
          onError={handleImgError}
        />
      ) : playbackUrl ? (
        <video
          src={playbackUrl}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={seekToContentFrame}
          onLoadedData={paintFirstFrame}
          className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
          aria-hidden
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Play size={24} className="text-white/30" />
        </div>
      )}
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
