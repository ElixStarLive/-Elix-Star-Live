import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchFollowers, fetchFollowing, type UserPreview } from '../features/users/usersApi';

export default function FollowList() {
  const { userId, type } = useParams<{ userId: string; type: string }>();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserPreview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const fetch = type === 'following' ? fetchFollowing : fetchFollowers;
    fetch(userId).then(({ data }) => {
      if (cancelled) return;
      if (data) setUsers(data.users);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, type]);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-fluid-xl font-bold capitalize">{type}</h1>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-white/60">No {type} yet.</p>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <Link
              key={user.id}
              to={`/profile/${user.id}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                  <User className="h-6 w-6 text-white/40" />
                </div>
              )}
              <div>
                <p className="font-semibold text-white">{user.displayName}</p>
                <p className="text-fluid-sm text-white/60">@{user.username}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
