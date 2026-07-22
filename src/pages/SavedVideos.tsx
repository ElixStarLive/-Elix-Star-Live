import React, { useState, useEffect, useCallback } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { Bookmark, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { request } from '../lib/apiClient';
import { showToast } from '../lib/toast';
import { subscribeVideoCollection } from '../lib/videoCollectionEvents';

interface SavedVideo {
  id: string;
  url: string;
  thumbnail_url: string;
  views: number;
  description: string;
}

export default function SavedVideos() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const mapVids = (vids: SavedVideo[]) =>
    vids.map((v) => ({
      id: v.id,
      url: v.url || '',
      thumbnail_url: v.thumbnail_url || (v as { thumbnail?: string }).thumbnail || '',
      views: v.views || 0,
      description: v.description || '',
    }));

  const load = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const { data, error } = await request(
        `/api/videos/saved/list?limit=50&offset=${offset}`,
      );
      if (error) {
        if (!append) {
          setVideos([]);
          setLoadError(error.message || 'Failed to load saved videos');
        }
        showToast(error.message || 'Failed to load saved videos');
        return;
      }
      const vids = Array.isArray(data?.videos)
        ? data.videos
        : Array.isArray(data)
          ? data
          : [];
      setHasMore(!!data?.hasMore);
      setLoadError(null);
      setVideos((prev) => (append ? [...prev, ...mapVids(vids)] : mapVids(vids)));
    } catch {
      if (!append) {
        setVideos([]);
        setLoadError('Failed to load saved videos');
      }
      showToast('Failed to load saved videos');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(0, false);
  }, [load]);

  useEffect(() => {
    return subscribeVideoCollection((ev) => {
      if (ev.type === 'refresh' && (ev.collection === 'all' || ev.collection === 'saved')) {
        void load(0, false);
        return;
      }
      if (ev.type !== 'saved') return;
      if (!ev.saved) {
        setVideos((prev) => prev.filter((v) => v.id !== ev.videoId));
        return;
      }
      void load(0, false);
    });
  }, [load]);

  const formatViews = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  };

  return (
    <div className="h-full min-h-0 w-full bg-[#111111] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] h-full min-h-0 flex flex-col overflow-y-auto bg-[#111111]">
        <div className="p-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1">
            <RoyceBackIcon />
          </button>
          <h1 className="text-lg font-bold text-gold-metallic">Saved Videos</h1>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-3 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loadError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
            <Bookmark size={48} className="text-white/20" />
            <p className="text-red-400/80 text-sm text-center">{loadError}</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
            <Bookmark size={48} className="text-white/20" />
            <p className="text-white/40 text-sm text-center">No saved videos yet. Tap the bookmark icon on any video to save it.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-0.5 p-0.5 flex-1 overflow-y-auto">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="aspect-[3/4] bg-[#111111] relative cursor-pointer group"
                  onClick={() => navigate(`/video/${video.id}`)}
                >
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video
                      src={video.url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                      onMouseOver={(e) => e.currentTarget.play()}
                      onMouseOut={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                  )}
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play size={24} fill="white" className="text-white" />
                  </div>
                  <span className="absolute bottom-1 left-1 text-[10px] font-bold text-white drop-shadow">
                    {formatViews(video.views)}
                  </span>
                </div>
              ))}
            </div>
            {hasMore ? (
              <div className="flex justify-center py-3">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void load(videos.length, true)}
                  className="px-4 py-2 rounded-lg bg-white/10 text-xs font-semibold disabled:opacity-40"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
