import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { request } from '../lib/apiClient';
import { Hash, TrendingUp } from 'lucide-react';
import { trackEvent } from '../lib/analytics';

interface Video {
  id: string;
  thumbnail_url: string;
  views_count?: number;
  views?: number;
  likes_count: number;
}

export default function Hashtag() {
  const navigate = useNavigate();
  const { tag } = useParams<{ tag: string }>();
  const [videos, setVideos] = useState<Video[]>([]);
  const [hashtagInfo, setHashtagInfo] = useState<{ use_count: number; trending_score: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tag) return;
    let cancelled = false;
    trackEvent('hashtag_view', { hashtag: tag });

    (async () => {
      setLoading(true);
      try {
        const { data: hashtagData } = await request(`/api/hashtags/${encodeURIComponent(tag.toLowerCase())}`);
        if (!cancelled && hashtagData) {
          setHashtagInfo({ use_count: hashtagData.use_count ?? 0, trending_score: hashtagData.trending_score ?? 0 });
        }

        const { data: videosData } = await request(`/api/hashtags/${encodeURIComponent(tag.toLowerCase())}/videos`);
        if (!cancelled) {
          const vids = Array.isArray(videosData) ? videosData : (videosData?.videos ?? []);
          setVideos(vids);
        }
      } catch {
        if (!cancelled) setVideos([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  return (
    <div className="bg-[#13151A] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] rounded-3xl overflow-hidden bg-[#13151A] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-6 bg-[#13151A]">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/feed')} className="p-1 hover:brightness-125 transition" title="Back to For You">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <div className="w-16 h-16 bg-gradient-to-br from-[#C9A96E] to-[#B8943F] rounded-full flex items-center justify-center">
            <Hash className="w-8 h-8 text-black" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">#{tag}</h1>
            {hashtagInfo && (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-white/60">{formatNumber(hashtagInfo.use_count)} videos</span>
                {hashtagInfo.trending_score > 50 && (
                  <div className="flex items-center gap-1 text-xs text-white">
                    <TrendingUp className="w-3 h-3" />
                    Trending
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Videos Grid */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="text-center py-12 text-white/40">Loading...</div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {videos.map(video => (
              <button
                key={video.id}
                onClick={() => navigate(`/video/${video.id}`)}
                className="relative aspect-[9/16] bg-[#1C1E24] rounded overflow-hidden text-left"
              >
                <img
                  src={video.thumbnail_url || `https://ui-avatars.com/api/?name=Video&background=1C1E24&color=C9A96E&size=200`}
                  alt="Video"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 text-white text-xs font-semibold">
                  {formatNumber(video.views_count ?? video.views ?? 0)} views
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && videos.length === 0 && (
          <div className="text-center py-12 text-white/40">No videos found for this hashtag</div>
        )}
      </div>
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}
