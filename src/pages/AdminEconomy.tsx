import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { fetchAdminEconomy, type EconomyStats } from '../features/admin/adminApi';

const STAT_KEYS: { key: keyof EconomyStats; label: string }[] = [
  { key: 'users', label: 'Users' },
  { key: 'videos', label: 'Videos' },
  { key: 'follows', label: 'Follows' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'liveStreams', label: 'Live Now' },
  { key: 'reports', label: 'Reports' },
];

export default function AdminEconomy() {
  const [stats, setStats] = useState<EconomyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAdminEconomy().then(({ data }) => {
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
      <header className="mb-4 flex items-center gap-3">
        <Link to="/admin" className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-fluid-xl font-bold">Admin — Economy</h1>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : !stats ? (
        <p className="text-white/60">Could not load economy stats.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {STAT_KEYS.map(({ key, label }) => (
            <div key={key} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <BarChart3 className="mx-auto mb-2 h-6 w-6 text-white/60" />
              <p className="text-fluid-2xl font-bold">{(stats[key] ?? 0).toLocaleString()}</p>
              <p className="text-fluid-sm text-white/60">{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
