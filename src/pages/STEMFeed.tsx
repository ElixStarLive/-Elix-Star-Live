import { useEffect, useState } from 'react';
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
      <h1 className="mb-4 text-fluid-xl font-bold">STEM</h1>
      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : (
        <VideoList videos={videos} emptyTitle="STEM videos will appear here." />
      )}
    </div>
  );
}
