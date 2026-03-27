import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Send, ArrowLeft, Video } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { apiUrl } from '../lib/api';
import { LevelBadge } from '../components/LevelBadge';
import { initiateCall } from '../lib/callService';

interface Message {
  id: string;
  sender_id: string;
  text: string;
  created_at: string;
}

interface OtherUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  level?: number;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().session?.access_token;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export default function ChatThread() {
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId: string }>();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isSystemThread = useMemo(() => {
    return ['new', 'followers', 'likes', 'comments', 'mentions'].includes(threadId || '');
  }, [threadId]);

  useEffect(() => {
    if (!threadId || isSystemThread || !user?.id) return;

    const load = async () => {
      try {
        const [msgsRes, threadsRes] = await Promise.all([
          fetch(apiUrl(`/api/chat/threads/${threadId}/messages`), { headers: authHeaders(), credentials: "include" }),
          fetch(apiUrl(`/api/chat/threads`), { headers: authHeaders(), credentials: "include" }),
        ]);

        if (msgsRes.ok) {
          const msgsData = await msgsRes.json();
          setMessages(msgsData.data || []);
        }

        if (threadsRes.ok) {
          const threadsData = await threadsRes.json();
          const thread = (threadsData.data || []).find((t: any) => t.id === threadId);
          if (thread) {
            setOtherUser({
              user_id: thread.other_user_id,
              username: thread.other_username || "User",
              avatar_url: thread.other_avatar || null,
            });
          }
        }
      } catch {}
      setLoading(false);
      scrollToBottom();
    };

    load();
    const interval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/chat/threads/${threadId}/messages`), { headers: authHeaders(), credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.data || []);
        }
      } catch {}
    }, 5000);

    return () => clearInterval(interval);
  }, [threadId, user?.id, isSystemThread]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 100);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !user?.id || !threadId) return;

    const msgText = draft.trim();
    setDraft('');

    try {
      const res = await fetch(apiUrl(`/api/chat/threads/${threadId}/messages`), {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({ text: msgText }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.data]);
        scrollToBottom();
      } else {
        setDraft(msgText);
      }
    } catch {
      setDraft(msgText);
    }
  };

  if (isSystemThread) {
    return (
      <div className="min-h-full min-h-0 flex flex-col bg-[#13151A] text-white p-4">
        <header className="flex items-center gap-4 mb-4 flex-shrink-0">
          <button type="button" onClick={() => navigate('/inbox')} className="p-1 rounded-lg active:bg-white/10" aria-label="Back to inbox">
            <ArrowLeft />
          </button>
          <h1 className="font-bold text-lg capitalize">{threadId}</h1>
        </header>
        <div className="flex-1 min-h-0 flex items-center justify-center text-white/50">No {threadId} yet.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-full min-h-0 w-full bg-[#13151A] text-white">
      <div className="flex flex-1 min-h-0 flex-col w-full">
        <div className="flex flex-1 min-h-0 flex-col w-full overflow-hidden bg-[#13151A] border-x border-white/[0.06] border-t-0 border-b-0">
        <header className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#13151A]">
          <div className="flex w-12 shrink-0 items-center justify-start">
            {otherUser && (
              <button
                type="button"
                onClick={async () => {
                  const callId = await initiateCall({ id: otherUser.user_id, username: otherUser.username, avatar: otherUser.avatar_url || '' });
                  if (callId) navigate('/call');
                }}
                className="p-2 rounded-full bg-[#13151A] border border-[#C9A96E]/40 hover:bg-[#C9A96E]/10 transition-colors"
                aria-label="Video call"
              >
                <Video className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
          {otherUser ? (
            <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
              <div className="flex-shrink-0">
                <LevelBadge level={otherUser.level || 1} avatar={otherUser.avatar_url || ''} size={36} layout="fixed" />
              </div>
              <span className="truncate text-center font-bold text-sm">{otherUser.username}</span>
            </div>
          ) : (
            <span className="flex-1 text-center font-bold text-lg">Chat</span>
          )}
          <div className="flex w-12 shrink-0 items-center justify-end">
            <button type="button" onClick={() => navigate('/inbox')} className="p-1 rounded-lg active:bg-white/10" aria-label="Back to inbox">
              <img src="/Icons/Gold power buton.png" alt="" className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scroll-smooth">
          {loading && <div className="text-center text-white/40 text-sm">Loading messages...</div>}
          {!loading && messages.length === 0 && (
            <div className="text-center text-white/40 text-sm mt-10">Start the conversation!</div>
          )}
          {messages.map((m) => {
            const isMe = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-snug break-words ${isMe ? 'bg-[#C9A96E] text-black rounded-tr-none' : 'bg-[#222] text-white rounded-tl-none'}`}>
                  {m.text}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex-shrink-0 p-4 bg-[#13151A] border-t border-white/10">
          <form className="flex items-center gap-2 bg-[#222] rounded-full px-4 py-2" onSubmit={handleSend}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/40"
              placeholder="Type a message..."
            />
            <button type="submit" disabled={!draft.trim()} className="p-2 bg-[#C9A96E] rounded-full text-black disabled:opacity-50 disabled:bg-gray-600">
              <Send size={16} />
            </button>
          </form>
        </div>
        </div>
      </div>
    </div>
  );
}
