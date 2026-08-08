import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { Send, ArrowLeft, Video, Play, Radio } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { fetchThreadMessages, sendThreadMessage } from '../lib/chatMessages';
import { apiListChatThreads, apiMarkThreadRead } from '../features/chat/chatApi';
import { websocket } from '../lib/websocket';
import { AvatarRing } from '../components/AvatarRing';
import { LevelBadge } from '../components/LevelBadge';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { CHAT_LEVEL_PILL_SIZE_PX, CHAT_PROFILE_RING_PX } from '../lib/profileFrame';
import { initiateCall } from '../lib/callService';
import { showToast } from '../lib/toast';
import { getVideoPosterUrl } from '../lib/bunnyStorage';
import { apiFetchProfileById, apiFetchProfiles, apiFetchVideoById } from '../features/feed/feedApi';
import { apiLiveStreams } from '../lib/live';

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
              <button key={i} type="button" onClick={() => nav(route)} className={`underline font-medium ${isMe ? 'text-black/80' : 'text-[#F5F5F7]'}`}>
                {appMatch[1] === 'video' ? 'View Video' : appMatch[1] === 'profile' ? 'View Profile' : 'Join Live'}
              </button>
            );
          }
          return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`underline ${isMe ? 'text-black/70' : 'text-[#F5F5F7]/80'}`}>{part}</a>;
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
        apiFetchProfileById(item.id).then(({ body }) => {
          if (!body) return;
          // API returns { profile: { username, displayName, avatarUrl } } (camelCase).
          const p = (body as { profile?: Record<string, unknown> })?.profile ?? body;
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
        apiFetchVideoById(item.id).then(({ video }) => {
          if (!video) return;
          const v = ((video as { video?: Record<string, unknown> }).video || video) as Record<string, unknown>;
          setPreviews(prev => ({
            ...prev,
            [item.key]: {
              type: 'video',
              id: item.id,
              thumbnail:
                (v.thumbnail_url as string | undefined) ||
                (v.thumbnail as string | undefined) ||
                ((v.url as string | undefined) ? getVideoPosterUrl(v.url as string) : undefined),
              username:
                ((v.user as { username?: string } | undefined)?.username as string | undefined) ||
                (v.username as string | undefined) ||
                '',
              description: (v.description as string | undefined) || '',
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

  const goInbox = useCallback(() => {
    navigate('/inbox');
  }, [navigate]);

  const handleVideoCall = useCallback(async () => {
    if (!otherUser) return;
    try {
      const callId = await initiateCall({ id: otherUser.user_id, username: otherUser.username, avatar: otherUser.avatar_url || '' });
      if (callId) navigate('/call');
      else showToast('Could not start video call');
    } catch {
      showToast('Could not start video call');
    }
  }, [navigate, otherUser]);

  const openWatchLive = useCallback((roomKey: string) => {
    navigate(`/watch/${roomKey}`);
  }, [navigate]);

  const openProfile = useCallback((profileId: string) => {
    navigate(`/profile/${profileId}`);
  }, [navigate]);

  const openVideo = useCallback((videoId: string) => {
    navigate(`/video/${videoId}`);
  }, [navigate]);

  const openPreviewMedia = useCallback((preview: LinkPreview) => {
    if (preview.type === 'video') openVideo(preview.id);
    else openWatchLive(preview.id);
  }, [openVideo, openWatchLive]);

  const openAppLink = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  // People currently live — shown as a horizontal scroll row at the top of the chat.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profilesResult, liveResult] = await Promise.all([
          apiFetchProfiles(),
          apiLiveStreams().catch(() => ({ streams: [], error: null })),
        ]);
        if (cancelled) return;
        const streams = liveResult.streams as Record<string, unknown>[];
        const profiles = profilesResult.profiles as Record<string, unknown>[];
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
          fetchThreadMessages(threadId),
          apiListChatThreads(),
        ]);

        if (msgsResult.error) {
          showToast(msgsResult.error);
        } else {
          setMessages(msgsResult.messages as Message[]);
          void apiMarkThreadRead(threadId);
        }

        if (!threadsResult.error && threadsResult.threads.length > 0) {
          const threadsList = threadsResult.threads;
          const thread = threadsList.find((t) => t.id === threadId);
          if (thread) {
            const row = thread as Record<string, unknown>;
            const other = (row.otherUser ?? {}) as Record<string, unknown>;
            setOtherUser({
              user_id: row.user1_id === user?.id ? String(row.user2_id ?? '') : String(row.user1_id ?? ''),
              username: String(other.display_name ?? other.username ?? row.other_username ?? 'User'),
              avatar_url: (other.avatar_url ?? row.other_avatar ?? null) as string | null,
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

    const onDmMessage = (raw: unknown) => {
      const data = (raw ?? {}) as { threadId?: string; message?: Message };
      if (!data.threadId || data.threadId !== threadId || !data.message?.id) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message!.id)) return prev;
        return [...prev, data.message!];
      });
      scrollToBottom();
      void apiMarkThreadRead(threadId);
    };
    websocket.on('dm_message', onDmMessage);

    // Slow fallback if WS presence is down (App keeps __feed__ connected when logged in).
    let pollFailures = 0;
    const interval = setInterval(async () => {
      const { messages: next, error } = await fetchThreadMessages(threadId);
      if (error) {
        pollFailures += 1;
        if (pollFailures >= 3) {
          showToast('Chat connection issue — messages may be delayed');
          pollFailures = 0;
        }
        return;
      }
      pollFailures = 0;
      setMessages(next as Message[]);
    }, 30000);

    return () => {
      websocket.off('dm_message', onDmMessage);
      clearInterval(interval);
    };
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

    const { message, error } = await sendThreadMessage(threadId, msgText);
    if (message) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === (message as Message).id)) return prev;
        return [...prev, message as Message];
      });
      scrollToBottom();
    } else {
      setDraft(msgText);
      showToast(error || 'Failed to send message');
    }
  };

  if (isSystemThread) {
    return (
      <div className="min-h-full min-h-0 flex flex-col bg-transparent text-white p-4">
        <header className="flex items-center gap-4 mb-4 flex-shrink-0">
          <button type="button" onClick={goInbox} className="p-1 rounded-lg active:bg-white/10" aria-label="Back to inbox">
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
      className="fixed inset-0 flex flex-col w-full max-w-[480px] mx-auto bg-transparent text-white z-[1]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
        <div className="flex justify-center pt-2 pb-2 flex-shrink-0" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>
        <header className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 bg-transparent">
          {otherUser ? (
            <button
              type="button"
              onClick={() => openProfile(otherUser.user_id)}
              className="min-w-0 flex-1 flex items-center justify-start gap-2 active:opacity-90"
              aria-label={`Open ${otherUser.username}'s profile`}
            >
              <AvatarRing
                src={otherUser.avatar_url || ''}
                alt={otherUser.username}
                size={CHAT_PROFILE_RING_PX}
              />
              <LevelBadge
                level={otherUser.level || 1}
                size={CHAT_LEVEL_PILL_SIZE_PX}
                hideCircle
              />
              <span className="min-w-0 truncate text-left font-bold text-sm text-[#F5F5F7]">
                {otherUser.username}
              </span>
            </button>
          ) : (
            <span className="flex-1 text-left font-bold text-sm text-[#F5F5F7]">Chat</span>
          )}
          {otherUser && (
            <button
              type="button"
              onClick={handleVideoCall}
              className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-white/[0.06] border border-white/15 active:scale-95 transition-transform"
              aria-label="Video call"
              title="Video call"
            >
              <Video className="w-5 h-5 text-[#F5F5F7]" strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            onClick={goInbox}
            className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Back to inbox"
            title="Back"
          >
            <RoyceBackIcon />
          </button>
        </header>

        <div className="mx-4 border-t border-[#D8D9DD]/45 flex-shrink-0" aria-hidden />

        {liveUsers.length > 0 && (
          <div className="flex-shrink-0 border-b border-white/10 bg-transparent">
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar px-3 py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {liveUsers.map((u) => (
                <button
                  key={u.roomKey}
                  type="button"
                  onClick={() => openWatchLive(u.roomKey)}
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
          {loading && <div className="text-center text-white/40 text-sm py-8">Loading messages...</div>}
          {!loading && messages.length === 0 && (
            <div className="h-full min-h-[40vh] flex items-center justify-center">
              <p className="text-center text-white/45 text-sm px-6">Start the conversation!</p>
            </div>
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
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-snug break-words ${isMe ? 'bg-[rgba(255,255,255,0.06)] text-white rounded-tr-none border border-[#2A2D33]' : 'bg-[rgba(255,255,255,0.06)] text-white rounded-tl-none border border-[#2A2D33]'}`}>
                  {preview && preview.type === 'profile' ? (
                    <button
                      type="button"
                      onClick={() => openProfile(preview.id)}
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
                        onClick={() => openPreviewMedia(preview)}
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
                    <MessageText text={m.text} isMe={isMe} navigate={openAppLink} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="flex-shrink-0 px-3 pt-2 bg-transparent border-t border-white/10"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}
        >
          <form className="flex items-center gap-2 rounded-full px-3 py-2 border border-white/15 bg-white/[0.06]" onSubmit={handleSend}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-white placeholder-white/40"
              placeholder="Type a message..."
              aria-label="Message"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              title="Send message"
              aria-label="Send message"
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-transparent text-[#F5F5F7] disabled:opacity-40 active:scale-95 transition-transform"
            >
              <Send size={16} strokeWidth={2.25} />
            </button>
          </form>
        </div>
    </div>
  );
}
