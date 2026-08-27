import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, User } from 'lucide-react';
import { fetchAdminProgression, type ProgressionUser } from '../features/admin/adminApi';

export default function AdminProgression() {
  const [users, setUsers] = useState<ProgressionUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAdminProgression().then(({ data }) => {
      if (cancelled) return;
      if (data) setUsers(data.users);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/admin" className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-fluid-xl font-bold">Admin — Progression</h1>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-white/60">No progression data yet.</p>
      ) : (
        <div className="space-y-2">
          {users.map((user, index) => (
            <div key={user.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-fluid-sm font-bold">
                {index + 1}
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <User className="h-5 w-5 text-white/40" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white">{user.displayName}</p>
                <p className="text-fluid-xs text-white/60">@{user.username}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-white">{user.level}</p>
                <p className="flex items-center gap-1 text-fluid-xs text-white/60">
                  <TrendingUp className="h-3 w-3" /> {user.xp.toLocaleString()} XP
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
