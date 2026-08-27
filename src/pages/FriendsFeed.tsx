import { useEffect, useState } from 'react';
import { fetchFriends, type FeedVideo } from '../features/feed/feedApi';
import { VideoList } from '../components/VideoList';

export default function FriendsFeed() {
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchFriends().then(({ data }) => {
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
      <h1 className="mb-4 text-fluid-xl font-bold">Friends</h1>
      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : (
        <VideoList videos={videos} emptyTitle="Connect with friends to see their videos here." />
      )}
    </div>
  );
}
