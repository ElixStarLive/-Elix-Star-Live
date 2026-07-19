import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { Search, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import EnhancedVideoPlayer from '../components/EnhancedVideoPlayer';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { request } from '../lib/apiClient';
import { fetchActiveStories, type StoryUserGroup } from '../lib/storiesApi';

interface SuggestedUser {
  id: string;
  username: string;
  name: string;
  avatar_url?: string;
  is_live?: boolean;
}

export default function FriendsFeed() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { friendVideos, fetchFriendVideos, friendsLoading: loading } = useVideoStore();
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [storyGroups, setStoryGroups] = useState<StoryUserGroup[]>([]);
  const [storyViewer, setStoryViewer] = useState<StoryUserGroup | null>(null);
  const [storyItemIndex, setStoryItemIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [chromeHidden, setChromeHidden] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const friendVideoIds = friendVideos.map((v) => v.id);

  const reloadStories = useCallback(() => {
    void fetchActiveStories().then(setStoryGroups);
  }, []);

  useEffect(() => {
    reloadStories();
    const onFocus = () => reloadStories();
    window.addEventListener('focus', onFocus);
    const t = window.setInterval(reloadStories, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(t);
    };
  }, [reloadStories]);

  const ownStory = user?.id ? storyGroups.find((g) => g.userId === user.id) : undefined;
  const currentStoryItem = storyViewer?.items[storyItemIndex];

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const [profilesResult, liveResult] = await Promise.all([
          request('/api/profiles'),
          request('/api/live/streams').catch(() => ({ data: null, error: null })),
        ]);
        const profilesBody = profilesResult.data ?? { profiles: [] };
        const liveBody = liveResult.data ?? { streams: [] };
        // Match live by any id a stream may carry (user_id can fall back to the room key server-side).
        const liveSet = new Set(
          (liveBody?.streams || [])
            .flatMap((s: Record<string, unknown>) => [s.hostUserId, s.userId, s.user_id, s.stream_key, s.streamKey, s.room_id, s.roomId])
            .filter(Boolean)
            .map((v: unknown) => String(v)),
        );

        const rows = Array.isArray(profilesBody?.profiles) ? profilesBody.profiles : [];
        const blocklist = ['', 'user', 'demo', 'test', 'unknown', 'anonymous', 'guest'];
        const mapped: SuggestedUser[] = rows
          .map((p: { user_id: string; userId: string; username?: string; display_name?: string; displayName?: string; avatar_url?: string; avatarUrl?: string }) => ({
            id: p.user_id || p.userId,
            username: p.username || 'user',
            name: p.display_name || p.displayName || p.username || 'User',
            avatar_url: p.avatar_url || p.avatarUrl,
            is_live: liveSet.has(String(p.user_id || p.userId || '')),
          }))
          .filter((p) => !!p.id && p.id !== user?.id)
          .filter((p) => {
            const name = (p.name || p.username || '').trim().toLowerCase();
            return name !== '' && !blocklist.includes(name) && name.length >= 2;
          });

        mapped.sort((a, b) => (a.is_live === b.is_live ? 0 : a.is_live ? -1 : 1));
        setSuggestedUsers(mapped);
      } catch { /* intentionally empty */ }
    };

    fetchUsers();
    fetchFriendVideos();
  }, [user?.id, fetchFriendVideos]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollPos = containerRef.current.scrollTop;
    const height = containerRef.current.clientHeight;
    const index = Math.round(scrollPos / height);
    if (index >= 0 && index < friendVideoIds.length) {
      setActiveIndex(index);
    }
    // Auto-hide the top story strip once scrolled into the feed (video goes full);
    // reveal it again when scrolling back up or at the very top.
    const last = lastScrollTopRef.current;
    if (scrollPos <= 8) setChromeHidden(false);
    else if (scrollPos > last + 6) setChromeHidden(true);
    else if (scrollPos < last - 6) setChromeHidden(false);
    lastScrollTopRef.current = scrollPos;
  };

  // Keep active index in sync with visible slide (so video play/pause works when scrolling)
  useEffect(() => {
    if (!containerRef.current || friendVideoIds.length === 0) return;
    const container = containerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = Number((entry.target as HTMLElement).dataset.slideIndex);
          if (!Number.isNaN(idx) && idx >= 0 && idx < friendVideoIds.length) {
            setActiveIndex(idx);
          }
        });
      },
      { root: container, rootMargin: '0px', threshold: 0.51 }
    );
    const slides = container.querySelectorAll('[data-slide-index]');
    slides.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendVideoIds.join(',')]);

  const handleVideoEnd = (index: number) => {
    if (!containerRef.current || index >= friendVideoIds.length - 1) return;
    containerRef.current.scrollTo({
      top: (index + 1) * containerRef.current.clientHeight,
      behavior: 'smooth',
    });
  };

  return (
    <div className="h-full min-h-0 w-full flex justify-center bg-[#111111]">
      {/* Video fills the column; the header + stories overlay the top and auto-hide on scroll so the video goes full. */}
      <div className="w-full max-w-[480px] h-full min-h-0 relative overflow-hidden mx-auto">
        <div
          className={`absolute top-0 left-0 right-0 bg-[#111111] z-20 pt-app-header-safe transition-transform duration-300 ${
            chromeHidden ? '-translate-y-full pointer-events-none' : 'translate-y-0'
          }`}
        >
          <div className="px-3 pb-1 flex items-center justify-between relative">
            <button onClick={() => navigate('/search')} className="w-8 h-8 royce-glow-disc flex items-center justify-center z-10" aria-label="Search">
              <Search size={16} className="royce-icon-gold" strokeWidth={2} />
            </button>
            <h1 className="text-sm font-bold text-white absolute left-1/2 transform -translate-x-1/2">Friends</h1>
            <div className="flex items-center gap-3 z-10">
              <button onClick={() => navigate(-1)} title="Back">
                <RoyceBackIcon />
              </button>
            </div>
          </div>

          {/* Circles — pushed down so avatar tops clear the header */}
          <div
            className="px-3 pb-2 relative z-[11]"
            style={{ marginTop: '6mm' }}
          >
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar pt-3" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Add story — first in Friends strip (before other users) */}
            <button
              type="button"
              onClick={() => navigate('/upload?type=story')}
              className="flex-shrink-0 flex flex-col items-center gap-1"
              style={{ width: 95, minWidth: 95 }}
              title="Add story"
            >
              <div className="relative" style={{ width: 56, height: 56 }}>
                <StoryGoldRingAvatar
                  size={56}
                  src={user?.avatar || '/royce/default-avatar.svg'}
                  alt={user?.username || 'You'}
                />
                <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#D4AF37] border-2 border-black flex items-center justify-center">
                  <Plus size={10} className="text-black" strokeWidth={3} />
                </span>
              </div>
              <div className="text-[11px] text-white/80 truncate w-full text-center">
                {ownStory?.items?.length ? 'Your story' : 'Add story'}
              </div>
            </button>
            {ownStory && ownStory.items.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setStoryViewer(ownStory);
                  setStoryItemIndex(0);
                }}
                className="flex-shrink-0 flex flex-col items-center gap-1"
                style={{ width: 95, minWidth: 95 }}
                title="Your story"
              >
                <StoryGoldRingAvatar
                  size={56}
                  src={user?.avatar || '/royce/default-avatar.svg'}
                  alt="Your story"
                />
                <div className="text-[11px] text-white/80 truncate w-full text-center">You</div>
              </button>
            ) : null}
            {/* Friends / Elix users */}
            {suggestedUsers.map((u) => {
              const friendStory = storyGroups.find((g) => g.userId === u.id);
              return (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  if (friendStory?.items?.length) {
                    setStoryViewer(friendStory);
                    setStoryItemIndex(0);
                    return;
                  }
                  if (u.is_live) navigate(`/watch/${u.id}`);
                  else navigate(`/profile/${u.id}`);
                }}
                className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: 95, minWidth: 95 }}
              >
                <StoryGoldRingAvatar
                  size={56}
                  live={u.is_live}
                  data-avatar-circle={u.is_live ? 'live' : undefined}
                  src={u.avatar_url || '/royce/default-avatar.svg'}
                  alt={u.name || u.username}
                />
                <div className="text-[11px] text-white/80 truncate w-full text-center">{u.name || u.username}</div>
              </button>
              );
            })}
            </div>
          </div>
        </div>

        <div
          ref={containerRef}
          className="absolute inset-0 z-0 w-full overflow-y-scroll snap-y snap-mandatory overscroll-none bg-black"
          style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
          onScroll={handleScroll}
        >
          {friendVideoIds.map((videoId, index) => (
            <div
              key={`friend-${videoId}-${index}`}
              data-slide-index={index}
              className="h-full w-full shrink-0 snap-start bg-black"
              style={{
                height: '100%',
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
              }}
            >
              <div className="w-full h-full min-h-0 relative overflow-hidden bg-black">
                <EnhancedVideoPlayer
                  videoId={videoId}
                  isActive={activeIndex === index}
                  onVideoEnd={() => handleVideoEnd(index)}
                />
              </div>
            </div>
          ))}

          {loading && friendVideoIds.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && friendVideoIds.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 px-6 text-center">
              <p className="text-base font-semibold mb-1">No videos yet</p>
              <p className="text-xs text-white/30 mb-4">Follow people or wait for followers to post — everyone shows in one feed</p>
              <button
                onClick={() => navigate('/discover')}
                className="px-5 py-2 bg-[#D4AF37] text-black rounded-full text-sm font-bold"
              >
                Discover people
              </button>
            </div>
          )}
        </div>
      </div>

      {storyViewer && currentStoryItem ? (
        <div
          className="fixed inset-0 z-[10060] bg-black flex items-center justify-center"
          onClick={() => {
            if (storyItemIndex + 1 < storyViewer.items.length) setStoryItemIndex((i) => i + 1);
            else setStoryViewer(null);
          }}
        >
          <button
            type="button"
            className="absolute top-[calc(env(safe-area-inset-top,0px)+12px)] left-3 z-10 text-white text-sm font-bold px-2 py-1"
            onClick={(e) => {
              e.stopPropagation();
              setStoryViewer(null);
            }}
          >
            Close
          </button>
          <div className="absolute top-[calc(env(safe-area-inset-top,0px)+48px)] left-3 right-3 flex items-center gap-2 z-10">
            <StoryGoldRingAvatar
              size={36}
              src={storyViewer.avatar || '/royce/default-avatar.svg'}
              alt={storyViewer.displayName}
            />
            <span className="text-white text-sm font-semibold truncate">{storyViewer.displayName}</span>
          </div>
          {currentStoryItem.mediaType === 'image' ? (
            <img
              src={currentStoryItem.mediaUrl}
              alt=""
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          ) : (
            <video
              key={currentStoryItem.id}
              src={currentStoryItem.mediaUrl}
              className="max-w-full max-h-full object-contain"
              autoPlay
              playsInline
              controls={false}
              onEnded={() => {
                if (storyItemIndex + 1 < storyViewer.items.length) setStoryItemIndex((i) => i + 1);
                else setStoryViewer(null);
              }}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
