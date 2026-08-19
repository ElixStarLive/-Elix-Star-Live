import React, { useCallback, useState, useEffect } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Hash, TrendingUp } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { apiFetchHashtag, apiFetchHashtagVideos } from '../features/feed/feedApi';
import { showToast } from '../lib/toast';
import { formatCompactNumber as formatNumber } from '../lib/formatCompactNumber';
import { rowNumber, rowString } from '../lib/rowReaders';
import { DISCOVER_HOME, containerReturnState, exitToFromLocationState } from '../lib/settingsNav';

interface Video {
  id: string;
  thumbnail_url: string;
  views_count?: number;
  views?: number;
  likes_count: number;
}

/**
 * `views_count` and `views` stay absent when the response omits them, so the
 * `views_count ?? views ?? 0` fallback in the grid still resolves in that order.
 */
function toHashtagVideo(row: Record<string, unknown>): Video | null {
  const id = rowString(row, 'id');
  if (!id) return null;
  return {
    id,
    thumbnail_url: rowString(row, 'thumbnail_url') ?? '',
    ...(row.views_count != null ? { views_count: rowNumber(row, 'views_count') } : {}),
    ...(row.views != null ? { views: rowNumber(row, 'views') } : {}),
    likes_count: rowNumber(row, 'likes_count'),
  };
}

export default function Hashtag() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tag } = useParams<{ tag: string }>();
  const [videos, setVideos] = useState<Video[]>([]);
  const [hashtagInfo, setHashtagInfo] = useState<{ use_count: number; trending_score: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const hashtagPath = tag ? `/hashtag/${tag}` : DISCOVER_HOME;

  const goFeed = useCallback(
    () => navigate(exitToFromLocationState(location.state, DISCOVER_HOME), { replace: true }),
    [navigate, location.state],
  );
  const openVideo = useCallback(
    (videoId: string) =>
      navigate(`/video/${videoId}`, { state: containerReturnState(hashtagPath) }),
    [navigate, hashtagPath],
  );

  useEffect(() => {
    if (!tag) return;
    let cancelled = false;
    trackEvent('hashtag_view', { hashtag: tag });

    (async () => {
      setLoading(true);
      try {
        const { body: hashtagData } = await apiFetchHashtag(tag);
        if (!cancelled && hashtagData) {
          setHashtagInfo({
            use_count: Number(hashtagData.use_count ?? 0),
            trending_score: Number(hashtagData.trending_score ?? 0),
          });
        }

        const { videos: vids } = await apiFetchHashtagVideos(tag);
        if (!cancelled) {
          setVideos(vids.map(toHashtagVideo).filter((v): v is Video => v !== null));
        }
      } catch {
        if (!cancelled) {
          showToast('Failed to load hashtag videos');
          /* keep prior videos — do not soft-empty on failure */
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tag]);

  return (
    <div className="h-full min-h-0 w-full bg-transparent text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] h-full min-h-0 flex flex-col overflow-hidden bg-transparent">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-6 bg-transparent">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={goFeed} className="p-1 hover:brightness-125 transition" title="Back to For You">
            <RoyceBackIcon />
          </button>
          <div className="w-16 h-16 bg-gradient-to-br from-[#E6E9EE] to-[#E6E9EE] rounded-full flex items-center justify-center">
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
                onClick={() => openVideo(video.id)}
                className="relative aspect-[9/16] bg-transparent rounded overflow-hidden text-left"
              >
                <img
                  src={video.thumbnail_url || `https://ui-avatars.com/api/?name=Video&background=1C1E24&color=FFFFFF&size=200`}
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

