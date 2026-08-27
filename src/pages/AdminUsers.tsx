import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User } from 'lucide-react';
import { fetchAdminUsers, type AdminUser } from '../features/admin/adminApi';

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdminUsers().then(({ data, error: apiError }) => {
      if (cancelled) return;
      if (apiError) {
        setError(apiError.message);
      } else if (data) {
        setUsers(data.users);
      }
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
        <h1 className="text-fluid-xl font-bold">Admin — Users</h1>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : error ? (
        <p className="text-rose-200">{error}</p>
      ) : users.length === 0 ? (
        <p className="text-white/60">No users yet.</p>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <User className="h-5 w-5 text-white/40" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white">{user.displayName}</p>
                <p className="text-fluid-xs text-white/60">@{user.username}</p>
                <p className="truncate text-fluid-xs text-white/40">{user.email}</p>
              </div>
              <div className="text-right text-fluid-xs text-white/50">
                {user.isVerified ? <span className="text-green-300">Verified</span> : 'Unverified'}
                {user.bannedUntil && <p className="text-rose-300">Banned</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
