import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Star, TrendingUp } from 'lucide-react';
import { fetchEngagement, type EngagementStats } from '../features/feed/feedApi';

export default function Engagement() {
  const [stats, setStats] = useState<EngagementStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchEngagement().then(({ data }) => {
      if (cancelled) return;
      if (data) setStats(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-2">
        <Flame className="h-6 w-6 text-orange-300" />
        <h1 className="text-fluid-xl font-bold">Engagement</h1>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : !stats ? (
        <p className="text-white/60">Could not load engagement stats.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-300" />
              <h2 className="text-fluid-base font-bold">Progression</h2>
            </div>
            <p className="text-fluid-lg font-bold">Level {stats.level}</p>
            <p className="text-fluid-sm text-white/60">{stats.xp.toLocaleString()} / {stats.nextLevelXp.toLocaleString()} XP</p>
            <div className="mt-2 h-3 w-full rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-green-300"
                style={{ width: `${Math.min(100, (stats.xp / stats.nextLevelXp) * 100)}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-300" />
              <h2 className="text-fluid-base font-bold">Active Challenges</h2>
            </div>
            {stats.activeChallenges.length === 0 ? (
              <p className="text-white/60">No active challenges.</p>
            ) : (
              <div className="space-y-2">
                {stats.activeChallenges.map((c) => (
                  <Link
                    key={c.id}
                    to={`/rising-stars/${c.id}`}
                    className="block rounded-xl border border-white/10 bg-white/5 p-3"
                  >
                    <p className="font-semibold text-white">{c.title}</p>
                    <p className="text-fluid-sm text-white/60">#{c.hashtag}</p>
                    <p className="text-fluid-xs text-white/40">Ends {new Date(c.endAt).toLocaleDateString()}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
