import { useState } from 'react';
import { Search, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { searchUsers, type UserPreview } from '../features/users/usersApi';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserPreview[]>([]);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) {
      setUsers([]);
      return;
    }
    setLoading(true);
    const { data } = await searchUsers(query.trim());
    setLoading(false);
    if (data) setUsers(data.users);
  };

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <h1 className="mb-4 text-fluid-xl font-bold">Search</h1>
      <form onSubmit={onSubmit} className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          className="w-full rounded-xl border border-white/10 bg-white/10 py-3 pl-10 pr-3 text-fluid-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
        />
      </form>

      {loading ? (
        <p className="text-white/60">Searching…</p>
      ) : users.length === 0 ? (
        <p className="text-white/60">Type at least 2 characters to search for people.</p>
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
              {user.isVerified && <span className="ml-auto text-fluid-xs text-white/80">Verified</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
