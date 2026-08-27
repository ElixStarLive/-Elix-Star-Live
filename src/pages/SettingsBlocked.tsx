import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Ban, User, X } from 'lucide-react';
import { fetchBlocked, unblockUser, type UserPreview } from '../features/users/usersApi';

export default function SettingsBlocked() {
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState<UserPreview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetchBlocked().then(({ data }) => {
      if (data) setUsers(data.users);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const exit = () => {
    const from = (location.state as { from?: string } | null)?.from ?? '/settings';
    navigate(from, { replace: true });
  };

  const onUnblock = async (userId: string) => {
    const { error } = await unblockUser(userId);
    if (error) return;
    load();
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Blocked Accounts</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="p-4">
        {loading ? (
          <p className="text-white/60">Loading…</p>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Ban className="mb-4 h-12 w-12 text-white/30" />
            <p className="text-fluid-sm text-white/60">No blocked accounts.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                    <User className="h-6 w-6 text-white/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white">{user.displayName}</p>
                  <p className="text-fluid-sm text-white/60">@{user.username}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onUnblock(user.id)}
                  className="rounded-xl border border-white/40 px-3 py-2 text-fluid-xs font-bold"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
