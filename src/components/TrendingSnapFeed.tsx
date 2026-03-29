import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import type { Video } from '../store/useVideoStore';
import { getVideoPosterUrl } from '../lib/bunnyStorage';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function VideoThumbnail({ video }: { video: Video }) {
  const navigate = useNavigate();
  const poster = video.thumbnail || getVideoPosterUrl(video.url || '');

  return (
    <button
      type="button"
      className="relative aspect-[3/4] bg-[#0A0B0E] rounded-lg overflow-hidden cursor-pointer group"
      onClick={() => navigate(`/video/${video.id}`)}
    >
      {poster ? (
        <img
          src={poster}
          alt=""
          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.dataset.fallback) return;
            img.dataset.fallback = '1';
            img.style.opacity = '0';
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Play size={24} className="text-white/30" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
      <div className="absolute bottom-1.5 left-1.5 right-1.5">
        <div className="flex items-center gap-1">
          <Play size={10} fill="white" className="text-white" />
          <span className="text-[10px] font-bold text-white drop-shadow-md">{formatNumber(video.stats?.views || 0)}</span>
        </div>
        <div className="text-[9px] text-white/80 truncate mt-0.5">@{video.user?.username || 'user'}</div>
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
