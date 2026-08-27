import { useEffect, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { fetchSaved, type FeedVideo } from '../features/feed/feedApi';
import { VideoList } from '../components/VideoList';

export default function SavedVideos() {
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSaved().then(({ data }) => {
      if (cancelled) return;
      if (data) setVideos(data.videos);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <h1 className="mb-4 flex items-center gap-2 text-fluid-xl font-bold">
        <Bookmark className="h-6 w-6" />
        Saved
      </h1>
      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : (
        <VideoList videos={videos} emptyTitle="Videos you save will appear here." />
      )}
    </div>
  );
}
