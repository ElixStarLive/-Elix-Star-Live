import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useVideoStore } from '../store/useVideoStore';
import { getVideoPosterUrl, resolveVideoPlaybackUrl } from '../lib/bunnyStorage';

const LAST_FEED_VIDEO_KEY = 'elix_last_feed_video_id';

/** Routes that already fill the screen with their own media — no backdrop. */
function shouldHideBackdrop(pathname: string): boolean {
  if (pathname === '/' || pathname === '/feed') return true;
  if (pathname === '/stem' || pathname === '/following' || pathname === '/friends') return true;
  if (pathname.startsWith('/video/')) return true;
  if (pathname === '/live' || pathname.startsWith('/live/')) return true;
  if (pathname.startsWith('/watch/')) return true;
  if (pathname === '/create' || pathname.startsWith('/create/')) return true;
  if (pathname === '/upload') return true;
  if (pathname === '/login' || pathname === '/register') return true;
  return false;
}

/**
 * For You video under Profile / Inbox / Settings / Shop.
 * Page must stay clear (no black wash) or this never shows.
 */
export default function AppGlassBackdrop() {
  const location = useLocation();
  const videos = useVideoStore((s) => s.videos);
  const fetchVideos = useVideoStore((s) => s.fetchVideos);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hidden = shouldHideBackdrop(location.pathname);

  useEffect(() => {
    if (hidden) return;
    if (videos.length === 0) {
      void fetchVideos().catch(() => undefined);
    }
  }, [hidden, videos.length, fetchVideos]);

  const video = useMemo(() => {
    if (!videos.length) return null;
    let lastId = '';
    try {
      lastId = sessionStorage.getItem(LAST_FEED_VIDEO_KEY) || '';
    } catch {
      lastId = '';
    }
    return (lastId && videos.find((v) => v.id === lastId)) || videos[0] || null;
  }, [videos]);

  const src = video ? resolveVideoPlaybackUrl(video.url || '') : '';
  const poster = video
    ? video.thumbnail || getVideoPosterUrl(video.url || '')
    : '';

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (hidden || !src) {
      el.pause();
      return;
    }
    el.muted = true;
    void el.play().catch(() => undefined);
  }, [hidden, src]);

  if (hidden || !src) return null;

  return (
    <div
      className="fixed inset-0 z-0 flex justify-center pointer-events-none overflow-hidden"
      aria-hidden
    >
      <div className="relative w-full max-w-[480px] h-full bg-transparent">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          src={src}
          poster={poster || undefined}
          muted
          playsInline
          loop
          autoPlay
        />
      </div>
    </div>
  );
}

/** Call from the For You feed when the active slide changes. */
export function rememberFeedVideoId(videoId: string): void {
  if (!videoId) return;
  try {
    sessionStorage.setItem(LAST_FEED_VIDEO_KEY, videoId);
  } catch {
    /* ignore */
  }
}
