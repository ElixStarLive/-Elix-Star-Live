import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { Search, Plus } from 'lucide-react';
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

type FeedSlide =
  | { kind: 'story'; key: string; group: StoryUserGroup; item: StoryItem }
  | { kind: 'video'; key: string; videoId: string };

const STORY_IMAGE_MS = 5000;

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
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted={false}
          controls={false}
          loop={false}
          onEnded={onEnded}
        />
      )}
      <div className="absolute top-[calc(env(safe-area-inset-top,0px)+72px)] left-3 right-3 z-10 flex items-center gap-2 pointer-events-none">
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

export default function FriendsFeed() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { friendVideos, fetchFriendVideos, friendsLoading: loading } = useVideoStore();
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [storyGroups, setStoryGroups] = useState<StoryUserGroup[]>([]);
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

  /** Stories first (own first, then others), then friend videos — same full-screen snap containers. */
  const feedSlides = useMemo((): FeedSlide[] => {
    const slides: FeedSlide[] = [];
    const orderedGroups = [...storyGroups].sort((a, b) => {
      if (user?.id && a.userId === user.id) return -1;
      if (user?.id && b.userId === user.id) return 1;
      return 0;
    });
    for (const group of orderedGroups) {
      for (const item of group.items || []) {
        if (!item?.mediaUrl) continue;
        slides.push({
          kind: 'story',
          key: `story-${item.id}`,
          group,
          item,
        });
      }
    }
    for (const videoId of friendVideoIds) {
      slides.push({ kind: 'video', key: `video-${videoId}`, videoId });
    }
    return slides;
  }, [storyGroups, friendVideoIds, user?.id]);

  const feedLen = feedSlides.length;

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
    const last = lastScrollTopRef.current;
    if (scrollPos <= 8) setChromeHidden(false);
    else if (scrollPos > last + 6) setChromeHidden(true);
    else if (scrollPos < last - 6) setChromeHidden(false);
    lastScrollTopRef.current = scrollPos;
  };

  const feedSlideKeys = feedSlides.map((s) => s.key).join('|');

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

  const openUserStoryInFeed = (userId: string) => {
    const idx = feedSlides.findIndex((s) => s.kind === 'story' && s.group.userId === userId);
    if (idx >= 0) {
      setChromeHidden(true);
      scrollToIndex(idx);
    }
  };

  return (
    <div className="h-full min-h-0 w-full flex justify-center bg-[#111111]">
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

          <div
            className="px-3 pb-2 relative z-[11]"
            style={{ marginTop: '6mm' }}
          >
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar pt-3" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                onClick={() => openUserStoryInFeed(ownStory.userId)}
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
            {suggestedUsers.map((u) => {
              const friendStory = storyGroups.find((g) => g.userId === u.id);
              return (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  if (friendStory?.items?.length) {
                    openUserStoryInFeed(u.id);
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
          {feedSlides.map((slide, index) => (
            <div
              key={slide.key}
              data-slide-index={index}
              className="h-full w-full shrink-0 snap-start bg-black"
              style={{
                height: '100%',
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
              }}
            >
              {slide.kind === 'story' ? (
                <FriendStorySlide
                  group={slide.group}
                  item={slide.item}
                  isActive={activeIndex === index}
                  onEnded={() => handleSlideEnd(index)}
                />
              ) : (
                <div className="w-full h-full min-h-0 relative overflow-hidden bg-black">
                  <EnhancedVideoPlayer
                    videoId={slide.videoId}
                    isActive={activeIndex === index}
                    onVideoEnd={() => handleSlideEnd(index)}
                  />
                </div>
              )}
            </div>
          ))}

          {loading && feedLen === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && feedLen === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 px-6 text-center">
              <p className="text-base font-semibold mb-1">No stories or videos yet</p>
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
      </div>
    </div>
  );
}
