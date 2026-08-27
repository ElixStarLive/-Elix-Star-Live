import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart, MessageCircle, Share2, User } from 'lucide-react';
import { fetchVideo, type FeedVideo } from '../features/feed/feedApi';

export default function VideoView() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const [video, setVideo] = useState<FeedVideo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    fetchVideo(videoId).then(({ data }) => {
      if (cancelled) return;
      if (data) setVideo(data.video);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-black text-white">
        <p className="text-white/60">Loading…</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-black p-4 text-center text-white">
        <p>Video not found.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-black/80 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={() => navigate('/feed', { replace: true })} className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-fluid-base font-bold">Video</h1>
      </header>

      <main className="p-4">
        <div className="relative mb-4 aspect-[9/16] w-full overflow-hidden rounded-2xl bg-white/5">
          <video src={video.url} controls className="h-full w-full object-contain" poster={video.thumbnail} />
        </div>

        <div className="mb-4 flex items-center gap-3">
          {video.user.avatarUrl ? (
            <img src={video.user.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <User className="h-6 w-6 text-white/40" />
            </div>
          )}
          <div>
            <p className="font-semibold text-white">{video.user.displayName}</p>
          </div>
        </div>

        <p className="text-fluid-sm text-white/80">{video.description}</p>

        {video.hashtags.length > 0 && (
          <p className="mt-2 text-fluid-sm text-blue-300">#{video.hashtags.join(' #')}</p>
        )}

        <div className="mt-4 flex items-center gap-6 text-fluid-sm text-white/70">
          <button type="button" className="flex items-center gap-1">
            <Heart className="h-4 w-4" />
            {video.stats.likes}
          </button>
          <button type="button" className="flex items-center gap-1">
            <MessageCircle className="h-4 w-4" />
            {video.stats.comments}
          </button>
          <button type="button" className="flex items-center gap-1">
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>
      </main>
    </div>
  );
}
