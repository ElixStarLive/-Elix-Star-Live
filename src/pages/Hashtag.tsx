import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchHashtag, type FeedVideo } from '../features/feed/feedApi';
import { VideoList } from '../components/VideoList';

export default function Hashtag() {
  const { tag } = useParams<{ tag: string }>();
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tag) return;
    let cancelled = false;
    fetchHashtag(tag).then(({ data }) => {
      if (cancelled) return;
      if (data) setVideos(data.videos);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tag]);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <h1 className="mb-4 text-fluid-xl font-bold">#{tag}</h1>
      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : (
        <VideoList videos={videos} emptyTitle={`No videos found for #${tag} yet.`} />
      )}
    </div>
  );
}
