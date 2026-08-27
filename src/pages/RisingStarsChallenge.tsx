import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star } from 'lucide-react';
import { fetchChallenge, type Challenge, type FeedVideo } from '../features/feed/feedApi';
import { VideoList } from '../components/VideoList';

export default function RisingStarsChallenge() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!challengeId) return;
    let cancelled = false;
    fetchChallenge(challengeId).then(({ data }) => {
      if (cancelled) return;
      if (data) {
        setChallenge(data.challenge);
        setVideos(data.videos);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-3">
        <button type="button" onClick={() => navigate('/rising-stars')} className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-fluid-xl font-bold">Challenge</h1>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : !challenge ? (
        <p className="text-white/60">Challenge not found.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Star className="h-6 w-6 text-yellow-300" />
              <h2 className="text-fluid-lg font-bold">{challenge.title}</h2>
            </div>
            <p className="text-fluid-sm text-white/70">{challenge.description}</p>
            <p className="text-fluid-sm text-white/70">Hashtag: #{challenge.hashtag}</p>
            <p className="text-fluid-xs text-white/40">Ends {new Date(challenge.endAt).toLocaleDateString()}</p>
            {challenge.isActive && <span className="text-fluid-xs text-green-300">Active</span>}
          </div>

          <h3 className="text-fluid-base font-bold">Submissions</h3>
          <VideoList videos={videos} emptyTitle="No submissions yet" />
        </div>
      )}
    </div>
  );
}
