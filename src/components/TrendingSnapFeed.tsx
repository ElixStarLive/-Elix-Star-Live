import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Video } from '../store/useVideoStore';
import { getVideoPosterUrl } from '../lib/bunnyStorage';

function TrendingSlide({ video }: { video: Video }) {
  const SEARCH_TRENDING_VIDEO_DOWN_MM = 3;
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !video.url) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) videoRef.current?.play().catch(() => {});
        else videoRef.current?.pause();
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [video.url]);

  const poster = video.thumbnail || getVideoPosterUrl(video.url || '');

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black cursor-pointer"
      onClick={() => navigate(`/video/${video.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/video/${video.id}`);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {video.url ? (
        <video
          ref={videoRef}
          src={video.url}
          poster={poster || undefined}
          muted
          loop
          playsInline
          preload="metadata"
          className="video-media-fill absolute inset-0 size-full"
          style={{ top: `${SEARCH_TRENDING_VIDEO_DOWN_MM}mm` }}
        />
      ) : (
        <img
          src={poster}
          alt=""
          className="absolute inset-0 size-full object-cover"
          style={{ top: `${SEARCH_TRENDING_VIDEO_DOWN_MM}mm` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
      <div className="absolute bottom-2 left-2 right-2 text-left">
        <div className="text-[10px] font-bold text-white truncate">@{video.user?.username || 'user'}</div>
        {video.description ? (
          <div className="text-[9px] text-white/80 line-clamp-2">{video.description}</div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Search trending: same snap model as For You — parent must be flex-1 min-h-0 so each slide is one viewport tall.
 */
export function TrendingSnapFeed({ videos }: { videos: Video[] }) {
  if (videos.length === 0) {
    return (
      <div className="text-xs text-white/30 py-3 px-4 text-center w-full">
        No videos yet.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col bg-black">
      <div
        className="flex-1 min-h-0 w-full overflow-y-scroll snap-y snap-mandatory relative no-scrollbar"
        style={{ scrollSnapType: 'y mandatory', overscrollBehavior: 'contain' }}
      >
        {videos.map((video) => (
          <div
            key={video.id}
            className="h-full w-full shrink-0 snap-start flex flex-col bg-black overflow-hidden"
            style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always', boxSizing: 'border-box' }}
          >
            <TrendingSlide video={video} />
          </div>
        ))}
      </div>
    </div>
  );
}
