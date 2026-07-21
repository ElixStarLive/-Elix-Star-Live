import React, { useEffect, useState, useRef, useMemo } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { Send, ArrowLeft, Video, Play, Radio } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { request } from '../lib/apiClient';
import { LevelBadge } from '../components/LevelBadge';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { initiateCall } from '../lib/callService';
import { showToast } from '../lib/toast';
import { getVideoPosterUrl } from '../lib/bunnyStorage';

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

function MessageText({ text, isMe, navigate: nav }: { text: string; isMe: boolean; navigate: (path: string) => void }) {
  const parts = text.split(URL_RE);
  if (parts.length <= 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => {
        if (URL_RE.test(part)) {
          URL_RE.lastIndex = 0;
          const appMatch = part.match(APP_LINK_RE);
          if (appMatch) {
            const route =
              appMatch[1] === 'video' ? `/video/${appMatch[2]}`
              : appMatch[1] === 'profile' ? `/profile/${appMatch[2]}`
              : `/watch/${appMatch[2]}`;
            return (
              <button key={i} type="button" onClick={() => nav(route)} className={`underline font-medium ${isMe ? 'text-black/80' : 'text-[#D4AF37]'}`}>
                {appMatch[1] === 'video' ? 'View Video' : appMatch[1] === 'profile' ? 'View Profile' : 'Join Live'}
              </button>
            );
          }
          return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`underline ${isMe ? 'text-black/70' : 'text-[#E8D5A3]/80'}`}>{part}</a>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

const APP_LINK_RE = /https?:\/\/[^\s]+\/(video|watch|live|profile)\/([a-zA-Z0-9_-]+)/;
const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Map the app-link path segment to a preview type. */
function linkTypeFromMatch(seg: string): 'video' | 'live' | 'profile' {
  if (seg === 'video') return 'video';
  if (seg === 'profile') return 'profile';
  return 'live';
}

interface LinkPreview {
  type: 'video' | 'live' | 'profile';
  id: string;
  thumbnail?: string;
  username?: string;
  description?: string;
}

function useLinkPreviews(messages: Message[]) {
  const [previews, setPreviews] = useState<Record<string, LinkPreview>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const toFetch: { key: string; type: 'video' | 'live' | 'profile'; id: string }[] = [];
    for (const m of messages) {
      const match = m.text.match(APP_LINK_RE);
      if (!match) continue;
      const type = linkTypeFromMatch(match[1]);
      const id = match[2];
      const key = `${type}:${id}`;
      if (fetchedRef.current.has(key)) continue;
      fetchedRef.current.add(key);
      toFetch.push({ key, type, id });
    }
    if (!toFetch.length) return;

    for (const item of toFetch) {
      if (item.type === 'profile') {
        request(`/api/profiles/${encodeURIComponent(item.id)}`).then(({ data }) => {
          if (!data) return;
          // API returns { profile: { username, displayName, avatarUrl } } (camelCase).
          const p = (data as { profile?: Record<string, unknown> })?.profile ?? data;
          const name =
            (typeof p.displayName === 'string' && p.displayName.trim()) ||
            (typeof p.username === 'string' && p.username.trim()) ||
            'Profile';
          const avatar = typeof p.avatarUrl === 'string' ? p.avatarUrl : '';
          setPreviews(prev => ({
            ...prev,
            [item.key]: { type: 'profile', id: item.id, thumbnail: avatar, username: name },
          }));
        }).catch(() => {});
      } else if (item.type === 'video') {
        request(`/api/videos/${encodeURIComponent(item.id)}`).then(({ data }) => {
          if (!data) return;
          const v = data.video || data;
          setPreviews(prev => ({
            ...prev,
            [item.key]: {
              type: 'video',
              id: item.id,
              thumbnail: v.thumbnail_url || v.thumbnail || (v.url ? getVideoPosterUrl(v.url) : undefined),
              username: v.user?.username || v.username || '',
              description: v.description || '',
            },
          }));
        }).catch(() => {});
      } else {
        setPreviews(prev => ({
          ...prev,
          [item.key]: { type: 'live', id: item.id },
        }));
      }
    }
  }, [messages]);

  return previews;
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
  const previews = useLinkPreviews(messages);
  const [liveUsers, setLiveUsers] = useState<{ roomKey: string; userId: string; name: string; avatar: string }[]>([]);

  const isSystemThread = useMemo(() => {
    return ['new', 'followers', 'likes', 'comments', 'mentions'].includes(threadId || '');
  }, [threadId]);

  // People currently live — shown as a horizontal scroll row at the top of the chat.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profilesResult, liveResult] = await Promise.all([
          request('/api/profiles'),
          request('/api/live/streams').catch(() => ({ data: null })),
        ]);
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const streams = ((liveResult.data as any)?.streams || []) as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const profiles = ((profilesResult.data as any)?.profiles || []) as any[];
        const byId = new Map(profiles.map((p) => [String(p.user_id || p.userId || ''), p]));
        const seen = new Set<string>();
        const list = streams
          .map((s) => {
            // Navigate with the room key (stream_key/room_id) so tapping actually joins the live.
            const roomKey = String(s.stream_key ?? s.streamKey ?? s.room_id ?? s.roomId ?? s.id ?? '');
            const userId = String(s.user_id ?? s.userId ?? s.hostUserId ?? '');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = byId.get(userId) as any;
            return {
              roomKey,
              userId,
              name: (p?.display_name || p?.displayName || p?.username || s.display_name || s.title || 'Live') as string,
              avatar: (p?.avatar_url || p?.avatarUrl || '/royce/default-avatar.svg') as string,
            };
          })
          .filter((x) => x.roomKey && x.userId !== user?.id && !seen.has(x.roomKey) && seen.add(x.roomKey));
        setLiveUsers(list);
      } catch {
        if (!cancelled) setLiveUsers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!threadId || isSystemThread || !user?.id) return;

    const load = async () => {
      try {
        const [msgsResult, threadsResult] = await Promise.all([
          request(`/api/chat/threads/${threadId}/messages`),
          request('/api/chat/threads'),
        ]);

        if (msgsResult.data) {
          const msgs = msgsResult.data.messages || msgsResult.data.data || [];
          setMessages(msgs);
          void request(`/api/chat/threads/${threadId}/read`, { method: 'POST' });
        }

        if (threadsResult.data) {
          const threadsList = threadsResult.data.threads || threadsResult.data.data || [];
          const thread = threadsList.find((t: Record<string, unknown>) => t.id === threadId);
          if (thread) {
            const other = thread.otherUser || {};
            setOtherUser({
              user_id: thread.user1_id === user?.id ? thread.user2_id : thread.user1_id,
              username: other.display_name || other.username || thread.other_username || "User",
              avatar_url: other.avatar_url || thread.other_avatar || null,
            });
          }
        }
      } catch {
        showToast('Failed to load messages');
      }
      setLoading(false);
      scrollToBottom();
    };

    load();
    const interval = setInterval(async () => {
      try {
        const { data } = await request(`/api/chat/threads/${threadId}/messages`);
        if (data) setMessages(data.messages || data.data || []);
      } catch { /* intentionally empty */ }
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
      const { data, error } = await request(`/api/chat/threads/${threadId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: msgText }),
      });

      if (!error && data) {
        const newMsg = data.message || data.data || data;
        setMessages(prev => [...prev, newMsg]);
        scrollToBottom();
      } else {
        setDraft(msgText);
        showToast('Failed to send message');
      }
    } catch {
      setDraft(msgText);
      showToast('Failed to send message');
    }
  };

  if (isSystemThread) {
    return (
      <div className="min-h-full min-h-0 flex flex-col bg-[#111111] text-white p-4">
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
    <div
      className="fixed left-0 right-0 flex flex-col w-full max-w-[480px] mx-auto bg-[#111111] text-white z-[1]"
      style={{ top: 0, bottom: 'var(--bottom-ui-reserve)' }}
    >
        <header className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#111111]">
          <div className="flex w-12 shrink-0 items-center justify-start">
            {otherUser && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const callId = await initiateCall({ id: otherUser.user_id, username: otherUser.username, avatar: otherUser.avatar_url || '' });
                    if (callId) navigate('/call');
                  } catch { /* auth or connection error */ }
                }}
                className="p-2 rounded-full bg-[#111111] border border-[#C9A227]/40 hover:bg-[#C9A227]/10 transition-colors"
                aria-label="Video call"
              >
                <Video className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
          {otherUser ? (
            <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
              <div className="flex-shrink-0">
                <LevelBadge level={otherUser.level || 1} avatar={otherUser.avatar_url || ''} layout="fixed" />
              </div>
              <span className="truncate text-center font-bold text-sm">{otherUser.username}</span>
            </div>
          ) : (
            <span className="flex-1 text-center font-bold text-lg">Chat</span>
          )}
          <div className="flex w-12 shrink-0 items-center justify-end">
            <button type="button" onClick={() => navigate('/inbox')} className="p-1 rounded-lg active:bg-white/10" aria-label="Back to inbox">
              <RoyceBackIcon />
            </button>
          </div>
        </header>

        {liveUsers.length > 0 && (
          <div className="flex-shrink-0 border-b border-white/10 bg-[#111111]">
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar px-3 py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {liveUsers.map((u) => (
                <button
                  key={u.roomKey}
                  type="button"
                  onClick={() => navigate(`/watch/${u.roomKey}`)}
                  className="flex-shrink-0 flex flex-col items-center gap-1"
                  style={{ width: 64, minWidth: 64 }}
                >
                  <StoryGoldRingAvatar live size={48} src={u.avatar} alt={u.name} />
                  <span className="text-[10px] text-white/80 truncate w-full text-center">{u.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scroll-smooth">
          {loading && <div className="text-center text-white/40 text-sm">Loading messages...</div>}
          {!loading && messages.length === 0 && (
            <div className="text-center text-white/40 text-sm mt-10">Start the conversation!</div>
          )}
          {messages.map((m) => {
            const isMe = m.sender_id === user?.id;
            const appMatch = m.text.match(APP_LINK_RE);
            // Always render a tappable card for shared video/live/profile links.
            // Use the fetched preview (thumbnail, name) when ready, else a minimal
            // fallback so it never degrades to a plain text link.
            const preview: LinkPreview | null = appMatch
              ? previews[`${linkTypeFromMatch(appMatch[1])}:${appMatch[2]}`] ?? {
                  type: linkTypeFromMatch(appMatch[1]),
                  id: appMatch[2],
                }
              : null;

            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-snug break-words ${isMe ? 'bg-[#D4AF37] text-black rounded-tr-none' : 'bg-[#222] text-white rounded-tl-none'}`}>
                  {preview && preview.type === 'profile' ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/profile/${preview.id}`)}
                      className="flex items-center gap-2.5 active:scale-[0.98] transition-transform text-left"
                    >
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/20 flex-shrink-0">
                        {preview.thumbnail ? (
                          <img src={preview.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center text-xs font-bold ${isMe ? 'text-black/60' : 'text-white/60'}`}>
                            {(preview.username || 'U').slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold truncate ${isMe ? 'text-black' : 'text-white'}`}>{preview.username || 'Profile'}</p>
                        <span className={`text-[11px] ${isMe ? 'text-black/50' : 'text-white/40'}`}>Tap to view profile</span>
                      </div>
                    </button>
                  ) : preview ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          if (preview.type === 'video') navigate(`/video/${preview.id}`);
                          else navigate(`/watch/${preview.id}`);
                        }}
                        className="w-full rounded-lg overflow-hidden mb-1.5 active:scale-[0.98] transition-transform text-left"
                      >
                        <div className="relative w-full aspect-video bg-black/30 rounded-lg overflow-hidden">
                          {preview.thumbnail ? (
                            <img src={preview.thumbnail} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {preview.type === 'live' ? <Radio size={28} className={isMe ? 'text-black/40' : 'text-white/40'} /> : <Play size={28} className={isMe ? 'text-black/40' : 'text-white/40'} />}
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isMe ? 'bg-black/30' : 'bg-white/20'}`}>
                              {preview.type === 'live' ? <Radio size={18} className="text-white" /> : <Play size={18} className="text-white" fill="white" />}
                            </div>
                          </div>
                          {preview.type === 'live' && (
                            <div className="absolute top-2 left-2 px-2 py-0.5 bg-white/20 rounded text-[10px] font-bold text-white">LIVE</div>
                          )}
                        </div>
                        {(preview.username || preview.description) && (
                          <div className="mt-1.5 px-0.5">
                            {preview.username && <p className={`text-xs font-semibold ${isMe ? 'text-black/70' : 'text-white/70'}`}>@{preview.username}</p>}
                            {preview.description && <p className={`text-xs mt-0.5 line-clamp-2 ${isMe ? 'text-black/50' : 'text-white/50'}`}>{preview.description}</p>}
                          </div>
                        )}
                      </button>
                      <span className={`text-[11px] ${isMe ? 'text-black/50' : 'text-white/40'}`}>
                        Tap to {preview.type === 'live' ? 'join live' : 'watch video'}
                      </span>
                    </div>
                  ) : (
                    <MessageText text={m.text} isMe={isMe} navigate={navigate} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex-shrink-0 p-4 bg-[#111111] border-t border-white/10">
          <form className="flex items-center gap-2 bg-[#222] rounded-full px-4 py-2" onSubmit={handleSend}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/40"
              placeholder="Type a message..."
            />
            <button type="submit" disabled={!draft.trim()} className="p-2 bg-[#FFFFFF] rounded-full text-black disabled:opacity-50 disabled:bg-gray-600">
              <Send size={16} />
            </button>
          </form>
        </div>
    </div>
  );
}
