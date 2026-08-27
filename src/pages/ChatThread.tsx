import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User } from 'lucide-react';
import { fetchThread, type InboxMessage } from '../features/inbox/inboxApi';
import { useAuthStore } from '../features/auth/authStore';

export default function ChatThread() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);

  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    fetchThread(threadId).then(({ data }) => {
      if (cancelled) return;
      if (data) setMessages(data.messages);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={() => navigate('/inbox', { replace: true })} className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-fluid-base font-bold">Chat</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-white/60">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-white/60">No messages in this thread yet.</p>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isMe = message.sender.id === currentUser?.id;
              return (
                <div key={message.id} className={`flex items-start gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                  {message.sender.avatarUrl ? (
                    <img src={message.sender.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                      <User className="h-4 w-4 text-white/40" />
                    </div>
                  )}
                  <div className={`max-w-[70%] rounded-2xl p-3 ${isMe ? 'bg-white/20' : 'bg-white/10'}`}>
                    <p className="text-fluid-sm">{message.body}</p>
                    <p className="mt-1 text-[10px] text-white/40">{new Date(message.createdAt).toLocaleTimeString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
