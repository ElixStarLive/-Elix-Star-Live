import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSTEM, type FeedVideo } from '../features/feed/feedApi';
import { VideoList } from '../components/VideoList';

export default function STEMFeed() {
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSTEM().then(({ data }) => {
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-fluid-xl font-bold">STEM</h1>
        <Link
          to="/upload"
          className="inline-flex items-center gap-1 rounded-xl border border-white/40 px-3 py-2 text-fluid-sm font-bold"
        >
          <Plus className="h-4 w-4" />
          Upload
        </Link>
      </div>
      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : (
        <VideoList videos={videos} emptyTitle="STEM videos will appear here once creators start sharing." />
      )}
    </div>
  );
}
