import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, MessageCircle, User } from 'lucide-react';
import { fetchInbox, type InboxThread } from '../features/inbox/inboxApi';

export default function Inbox() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchInbox().then(({ data }) => {
      if (cancelled) return;
      if (data) setThreads(data.threads);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-fluid-xl font-bold">Inbox</h1>
        <Link to="/alerts" className="rounded-full bg-white/10 p-2" aria-label="Alerts">
          <Bell className="h-5 w-5" />
        </Link>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageCircle className="mb-4 h-12 w-12 text-white/30" />
          <p className="text-fluid-sm text-white/60">No messages yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => (
            <Link
              key={thread.threadId}
              to={`/inbox/${thread.threadId}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
            >
              {thread.otherUser.avatarUrl ? (
                <img src={thread.otherUser.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                  <User className="h-6 w-6 text-white/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white">{thread.otherUser.displayName}</p>
                <p className="truncate text-fluid-sm text-white/60">{thread.lastMessage}</p>
              </div>
              {thread.unreadCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-black">
                  {thread.unreadCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
