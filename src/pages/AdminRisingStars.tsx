import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Star } from 'lucide-react';
import { createAdminChallenge, fetchAdminChallenges, type AdminChallenge } from '../features/admin/adminApi';

export default function AdminRisingStars() {
  const [challenges, setChallenges] = useState<AdminChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [hashtag, setHashtag] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetchAdminChallenges().then(({ data }) => {
      if (data) setChallenges(data.challenges);
      setLoading(false);
    });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAdminChallenges().then(({ data }) => {
      if (cancelled) return;
      if (data) setChallenges(data.challenges);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    const { error } = await createAdminChallenge({
      title: title.trim(),
      hashtag: hashtag.trim().replace(/^#/, ''),
    });
    setCreating(false);
    if (error) return;
    setTitle('');
    setHashtag('');
    load();
  };

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/admin" className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-fluid-xl font-bold">Admin — Rising Stars</h1>
      </header>

      <form onSubmit={onCreate} className="mb-4 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-fluid-base font-bold">New Challenge</h2>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
          required
        />
        <input
          type="text"
          value={hashtag}
          onChange={(e) => setHashtag(e.target.value)}
          placeholder="Hashtag (optional)"
          className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
        />
        <button
          type="submit"
          disabled={creating}
          className="w-full rounded-xl border border-white/40 bg-transparent py-2 text-fluid-sm font-bold disabled:opacity-60"
        >
          {creating ? 'Creating…' : 'Create Challenge'}
        </button>
      </form>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : challenges.length === 0 ? (
        <p className="text-white/60">No challenges yet.</p>
      ) : (
        <div className="space-y-2">
          {challenges.map((challenge) => (
            <div key={challenge.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-300" />
                <span className="font-semibold text-white">{challenge.title}</span>
                {challenge.isActive && <span className="text-fluid-xs text-green-300">Active</span>}
              </div>
              <p className="text-fluid-sm text-white/60">#{challenge.hashtag}</p>
              <p className="text-fluid-xs text-white/40">{new Date(challenge.startAt).toLocaleDateString()} → {new Date(challenge.endAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
