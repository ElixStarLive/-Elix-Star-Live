import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { Search, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import EnhancedVideoPlayer from '../components/EnhancedVideoPlayer';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { request } from '../lib/apiClient';
import { fetchActiveStories, type StoryItem, type StoryUserGroup } from '../lib/storiesApi';

interface SuggestedUser {
  id: string;
  username: string;
  name: string;
  avatar_url?: string;
  is_live?: boolean;
}

const STORY_IMAGE_MS = 5000;

/**
 * Story media container — separate from friend videos.
 * Full-screen story viewer only (opened from the top profile circles).
 */
function FriendStorySlide({
  group,
  item,
  isActive,
  onEnded,
}: {
  group: StoryUserGroup;
  item: StoryItem;
  isActive: boolean;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isImage = String(item.mediaType || '').toLowerCase() === 'image';

  useEffect(() => {
    if (!isActive || !isImage) return;
    const t = window.setTimeout(onEnded, STORY_IMAGE_MS);
    return () => window.clearTimeout(t);
  }, [isActive, isImage, item.id, onEnded]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || isImage) return;
    if (isActive) {
      el.currentTime = 0;
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isActive, isImage, item.id]);

  return (
    <div className="w-full h-full min-h-0 relative overflow-hidden bg-black">
      {isImage ? (
        <img
          src={item.mediaUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <video
          ref={videoRef}
          key={item.id}
          src={item.mediaUrl}
          className="absolute inset-0 w-full h-full object-cover elix-no-media-chrome"
          playsInline
          muted={false}
          controls={false}
          loop={false}
          onEnded={onEnded}
        />
      )}
      <div className="absolute top-[calc(env(safe-area-inset-top,0px)+12px)] left-3 right-12 z-10 flex items-center gap-2 pointer-events-none">
        <StoryGoldRingAvatar
          size={36}
          src={group.avatar || '/royce/default-avatar.svg'}
          alt={group.displayName}
        />
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {group.displayName || group.username}
          </p>
          <p className="text-[10px] text-white/70 font-medium">Story</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Friend video container — same chrome layout as the flower container
 * (top bar + profile circles stay on FriendsFeed). Separate from story viewer.
 * No profile circle drawn on top of the video (that lives in the Friends strip only).
 */
function FriendVideoSlide({
  videoId,
  isActive,
  onEnded,
}: {
  videoId: string;
  isActive: boolean;
  onEnded: () => void;
}) {
  return (
    <div className="w-full h-full min-h-0 relative overflow-hidden bg-black">
      <EnhancedVideoPlayer
        videoId={videoId}
        isActive={isActive}
        onVideoEnd={onEnded}
      />
    </div>
  );
}

export default function FriendsFeed() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { friendVideos, fetchFriendVideos, friendsLoading: loading } = useVideoStore();
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [storyGroups, setStoryGroups] = useState<StoryUserGroup[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [storyViewer, setStoryViewer] = useState<{
    group: StoryUserGroup;
    itemIndex: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  /** Friend videos only — stories open in a separate story container. */
  const feedLen = friendVideoIds.length;

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const [profilesResult, liveResult] = await Promise.all([
          request('/api/profiles'),
          request('/api/live/streams').catch(() => ({ data: null, error: null })),
        ]);
        const profilesBody = profilesResult.data ?? { profiles: [] };
        const liveBody = liveResult.data ?? { streams: [] };
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

  const scrollToIndex = useCallback((index: number) => {
    const el = containerRef.current;
    if (!el || index < 0 || index >= feedLen) return;
    el.scrollTo({
      top: index * el.clientHeight,
      behavior: 'smooth',
    });
  }, [feedLen]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollPos = containerRef.current.scrollTop;
    const height = containerRef.current.clientHeight;
    const index = Math.round(scrollPos / height);
    if (index >= 0 && index < feedLen) {
      setActiveIndex(index);
    }
  };

  const feedSlideKeys = friendVideoIds.join('|');

  useEffect(() => {
    if (!containerRef.current || feedLen === 0) return;
    const container = containerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = Number((entry.target as HTMLElement).dataset.slideIndex);
          if (!Number.isNaN(idx) && idx >= 0 && idx < feedLen) {
            setActiveIndex(idx);
          }
        });
      },
      { root: container, rootMargin: '0px', threshold: 0.51 }
    );
    const slides = container.querySelectorAll('[data-slide-index]');
    slides.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [feedLen, feedSlideKeys]);

  const handleSlideEnd = useCallback((index: number) => {
    if (index >= feedLen - 1) return;
    scrollToIndex(index + 1);
  }, [feedLen, scrollToIndex]);

  const openUserStory = (userId: string) => {
    const group = storyGroups.find((g) => g.userId === userId);
    if (!group?.items?.length) return;
    setStoryViewer({ group, itemIndex: 0 });
  };

  const storyItem = storyViewer
    ? storyViewer.group.items[storyViewer.itemIndex]
    : null;

  const advanceStory = useCallback(() => {
    setStoryViewer((prev) => {
      if (!prev) return null;
      const next = prev.itemIndex + 1;
      if (next >= (prev.group.items?.length || 0)) return null;
      return { group: prev.group, itemIndex: next };
    });
  }, []);

  return (
    <div className="h-full min-h-0 w-full flex justify-center bg-[#111111]">
      <div className="w-full max-w-[480px] h-full min-h-0 flex flex-col overflow-hidden mx-auto relative">
        {/* Friends chrome — room for icon glow; close stays inside column */}
        <div
          className="flex-shrink-0 bg-[#111111] z-20 overflow-visible"
          style={{ paddingTop: 'max(8px, env(safe-area-inset-top, 0px))' }}
        >
          <div className="px-4 h-11 flex items-center justify-between relative overflow-visible">
            <button
              type="button"
              onClick={() => navigate('/search')}
              className="w-9 h-9 royce-glow-disc flex items-center justify-center z-10"
              aria-label="Search"
            >
              <Search size={16} className="royce-icon-gold" strokeWidth={2} />
            </button>
            <h1 className="text-sm font-bold text-white absolute left-1/2 -translate-x-1/2 pointer-events-none">
              Friends
            </h1>
            <button
              type="button"
              onClick={() => navigate(-1)}
              title="Back"
              className="z-10 flex items-center justify-center"
            >
              <RoyceBackIcon />
            </button>
          </div>

          <div className="px-4 pt-1 pb-3 overflow-visible">
            <div
              className="flex gap-3.5 overflow-x-auto overflow-y-visible no-scrollbar py-1.5"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <button
                type="button"
                onClick={() => navigate('/upload?type=story')}
                className="flex-shrink-0 flex flex-col items-center gap-1"
                style={{ width: 72, minWidth: 72 }}
                title="Add story"
              >
                <div className="relative overflow-visible" style={{ width: 52, height: 52 }}>
                  <StoryGoldRingAvatar
                    size={52}
                    src={user?.avatar || '/royce/default-avatar.svg'}
                    alt={user?.username || 'You'}
                  />
                  <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#D4AF37] border-2 border-black flex items-center justify-center">
                    <Plus size={9} className="text-black" strokeWidth={3} />
                  </span>
                </div>
                <div className="text-[10px] text-white/80 truncate w-full text-center leading-tight">
                  {ownStory?.items?.length ? 'Your story' : 'Add story'}
                </div>
              </button>
              {ownStory && ownStory.items.length > 0 ? (
                <button
                  type="button"
                  onClick={() => openUserStory(ownStory.userId)}
                  className="flex-shrink-0 flex flex-col items-center gap-1"
                  style={{ width: 72, minWidth: 72 }}
                  title="Your story"
                >
                  <StoryGoldRingAvatar
                    size={52}
                    src={user?.avatar || '/royce/default-avatar.svg'}
                    alt="Your story"
                  />
                  <div className="text-[10px] text-white/80 truncate w-full text-center leading-tight">You</div>
                </button>
              ) : null}
              {suggestedUsers.map((u) => {
                const friendStory = storyGroups.find((g) => g.userId === u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      if (friendStory?.items?.length) {
                        openUserStory(u.id);
                        return;
                      }
                      if (u.is_live) navigate(`/watch/${u.id}`);
                      else navigate(`/profile/${u.id}`);
                    }}
                    className="flex-shrink-0 flex flex-col items-center gap-1"
                    style={{ width: 72, minWidth: 72 }}
                  >
                    <StoryGoldRingAvatar
                      size={52}
                      live={u.is_live}
                      data-avatar-circle={u.is_live ? 'live' : undefined}
                      src={u.avatar_url || '/royce/default-avatar.svg'}
                      alt={u.name || u.username}
                    />
                    <div className="text-[10px] text-white/80 truncate w-full text-center leading-tight">
                      {u.name || u.username}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Friend videos fill remaining height under chrome */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 z-0 w-full overflow-y-scroll snap-y snap-mandatory overscroll-none bg-black"
          style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
          onScroll={handleScroll}
        >
          {friendVideoIds.map((videoId, index) => {
            return (
              <div
                key={`video-${videoId}`}
                data-slide-index={index}
                className="h-full w-full shrink-0 snap-start bg-black"
                style={{
                  height: '100%',
                  scrollSnapAlign: 'start',
                  scrollSnapStop: 'always',
                }}
              >
                <FriendVideoSlide
                  videoId={videoId}
                  isActive={activeIndex === index && !storyViewer}
                  onEnded={() => handleSlideEnd(index)}
                />
              </div>
            );
          })}

          {loading && feedLen === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && feedLen === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 px-6 text-center">
              <p className="text-base font-semibold mb-1">No friend videos yet</p>
              <p className="text-xs text-white/30 mb-4">Add a photo or video story, or follow people who post</p>
              <button
                onClick={() => navigate('/upload?type=story')}
                className="px-5 py-2 bg-[#D4AF37] text-black rounded-full text-sm font-bold mb-3"
              >
                Add story
              </button>
              <button
                onClick={() => navigate('/discover')}
                className="px-5 py-2 bg-white/10 text-white rounded-full text-sm font-bold"
              >
                Discover people
              </button>
            </div>
          )}
        </div>

        {storyViewer && storyItem?.mediaUrl ? (
          <div className="absolute inset-0 z-[40] bg-black">
            <FriendStorySlide
              group={storyViewer.group}
              item={storyItem}
              isActive
              onEnded={advanceStory}
            />
            <button
              type="button"
              onClick={() => setStoryViewer(null)}
              className="absolute top-[calc(env(safe-area-inset-top,0px)+8px)] right-3 z-[41] w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"
              aria-label="Close story"
            >
              <X size={18} className="text-white" strokeWidth={2.5} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
