import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RoyceBackIcon } from '../components/royce';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import EnhancedVideoPlayer from '../components/EnhancedVideoPlayer';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { apiFetchProfiles } from '../features/feed/feedApi';
import { fetchActiveStories, type StoryItem, type StoryUserGroup } from '../lib/storiesApi';
import { prepareFeedVideoEl } from '../lib/prepareLiveVideoEl';
import { apiLiveStreams } from '../lib/live';

interface SuggestedUser {
  id: string;
  username: string;
  name: string;
  avatar_url?: string;
  is_live?: boolean;
}

const STORY_IMAGE_MS = 5000;

/**
 * Story media player — plays inside the Friends body (separate from friend videos).
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
      prepareFeedVideoEl(el, { muted: true });
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
          muted
          controls={false}
          loop={false}
          onEnded={onEnded}
        />
      )}
      <div className="absolute top-3 left-3 right-12 z-10 flex items-center gap-2 pointer-events-none">
        <StoryGoldRingAvatar
          size={36}
          glow
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
 * Friend video slide — lives in the Friends body under the top strip.
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
  const pageRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const [storiesVisible, setStoriesVisible] = useState(false);
  const friendVideoIds = friendVideos.map((v) => v.id);

  const goUploadStory = useCallback(() => {
    navigate('/upload?type=story');
  }, [navigate]);

  const goDiscover = useCallback(() => {
    navigate('/discover');
  }, [navigate]);

  const openUserOrLive = useCallback(
    (userId: string, isLive: boolean) => {
      navigate(isLive ? `/watch/${userId}` : `/profile/${userId}`);
    },
    [navigate],
  );

  const closeStoryViewer = useCallback(() => {
    setStoryViewer(null);
  }, []);

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
          apiFetchProfiles(),
          apiLiveStreams().catch(() => ({ streams: [], error: null })),
        ]);
        const profilesBody = { profiles: profilesResult.profiles ?? [] };
        const liveBody = { streams: liveResult.streams ?? [] };
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
    const el = containerRef.current;
    if (!el) return;
    const scrollPos = el.scrollTop;
    const height = el.clientHeight;
    const index = Math.round(scrollPos / height);
    if (index >= 0 && index < feedLen) {
      setActiveIndex(index);
    }
  };

  const onPullPointerDown = useCallback((e: React.PointerEvent) => {
    if (storyViewer) return;
    touchStartYRef.current = e.clientY;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, [storyViewer]);

  const onPullPointerMove = useCallback((e: React.PointerEvent) => {
    if (storyViewer) return;
    const startY = touchStartYRef.current;
    if (startY == null) return;
    const dy = e.clientY - startY;
    if (dy > 10) {
      setStoriesVisible(true);
      touchStartYRef.current = e.clientY;
    } else if (dy < -10) {
      setStoriesVisible(false);
      touchStartYRef.current = e.clientY;
    }
  }, [storyViewer]);

  const onPullPointerUp = useCallback(() => {
    touchStartYRef.current = null;
  }, []);

  /** Whole-page capture: push down shows circles, push up hides (touch + mouse). */
  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;

    let startY: number | null = null;

    const onDown = (e: PointerEvent) => {
      if (storyViewer) return;
      startY = e.clientY;
    };

    const onMove = (e: PointerEvent) => {
      if (storyViewer || startY == null) return;
      const dy = e.clientY - startY;
      if (dy > 10) {
        setStoriesVisible(true);
        startY = e.clientY;
      } else if (dy < -10) {
        setStoriesVisible(false);
        startY = e.clientY;
      }
    };

    const onUp = () => {
      startY = null;
    };

    root.addEventListener('pointerdown', onDown, { capture: true });
    root.addEventListener('pointermove', onMove, { capture: true });
    root.addEventListener('pointerup', onUp, { capture: true });
    root.addEventListener('pointercancel', onUp, { capture: true });
    return () => {
      root.removeEventListener('pointerdown', onDown, true);
      root.removeEventListener('pointermove', onMove, true);
      root.removeEventListener('pointerup', onUp, true);
      root.removeEventListener('pointercancel', onUp, true);
    };
  }, [storyViewer]);

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
    <div className="h-full min-h-0 w-full flex justify-center bg-[#121215]">
      <div
        ref={pageRef}
        className="w-full max-w-[480px] h-full min-h-0 flex flex-col overflow-hidden mx-auto relative"
      >
        {/* Top pull zone — always catchable when circles are hidden */}
        {!storiesVisible && !storyViewer ? (
          <div
            className="absolute inset-x-0 top-0 z-[35] h-[28%]"
            style={{ touchAction: 'none' }}
            onPointerDown={onPullPointerDown}
            onPointerMove={onPullPointerMove}
            onPointerUp={onPullPointerUp}
            onPointerCancel={onPullPointerUp}
            aria-hidden
          />
        ) : null}

        {/* Story circles — hidden until push down from top */}
        <div
          className={`absolute top-0 left-0 right-0 z-20 pointer-events-none transition-[transform,opacity] duration-300 ease-out ${
            storiesVisible && !storyViewer
              ? 'translate-y-0 opacity-100 overflow-visible'
              : '-translate-y-[200%] opacity-0 invisible overflow-hidden pointer-events-none'
          }`}
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
          aria-hidden={!(storiesVisible && !storyViewer)}
        >
          <div className="px-4 pb-1 overflow-visible pointer-events-auto">
            <div
              className="flex gap-3.5 overflow-x-auto overflow-y-visible no-scrollbar pb-0.5 min-h-[72px]"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <button
                type="button"
                onClick={() => {
                  if (ownStory?.items?.length) openUserStory(ownStory.userId);
                  else goUploadStory();
                }}
                className="flex-shrink-0 flex flex-col items-center gap-1"
                style={{ width: 72, minWidth: 72 }}
                title="Add story"
              >
                <div className="relative overflow-visible" style={{ width: 52, height: 52 }}>
                  <StoryGoldRingAvatar
                    size={52}
                    glow
                    src={user?.avatar || '/royce/default-avatar.svg'}
                    alt={user?.username || 'You'}
                  />
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      goUploadStory();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        goUploadStory();
                      }
                    }}
                    className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#FF3B3F] border-2 border-black flex items-center justify-center z-10"
                  >
                    <Plus size={9} className="text-black" strokeWidth={3} />
                  </span>
                </div>
                <div className="text-[10px] text-white/80 truncate w-full text-center leading-tight">
                  {ownStory?.items?.length ? 'Your story' : 'Add story'}
                </div>
              </button>
              {storyGroups
                .filter((g) => g.userId !== user?.id && (g.items?.length ?? 0) > 0)
                .map((g) => (
                  <button
                    key={`story-${g.userId}`}
                    type="button"
                    onClick={() => openUserStory(g.userId)}
                    className="flex-shrink-0 flex flex-col items-center gap-1"
                    style={{ width: 72, minWidth: 72 }}
                    title={g.displayName || g.username}
                  >
                    <StoryGoldRingAvatar
                      size={52}
                      glow
                      src={g.avatar || '/royce/default-avatar.svg'}
                      alt={g.displayName || g.username || ''}
                    />
                    <div className="text-[10px] text-white/80 truncate w-full text-center leading-tight">
                      {g.displayName || g.username}
                    </div>
                  </button>
                ))}
              {suggestedUsers
                .filter((u) => !storyGroups.some((g) => g.userId === u.id && (g.items?.length ?? 0) > 0))
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => openUserOrLive(u.id, !!u.is_live)}
                    className="flex-shrink-0 flex flex-col items-center gap-1"
                    style={{ width: 72, minWidth: 72 }}
                  >
                    <StoryGoldRingAvatar
                      size={52}
                      glow
                      live={u.is_live}
                      data-avatar-circle={u.is_live ? 'live' : undefined}
                      src={u.avatar_url || '/royce/default-avatar.svg'}
                      alt={u.name || u.username}
                    />
                    <div className="text-[10px] text-white/80 truncate w-full text-center leading-tight">
                      {u.name || u.username}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Friends body — friend videos + story player both live here; chrome stays above */}
        <div className="relative flex-1 min-h-0 z-0 w-full bg-black">
          {/* Friend video container — no on-video circle; circles live in the strip only */}
          <div
            ref={containerRef}
            className={`absolute inset-0 w-full overflow-y-scroll snap-y snap-mandatory overscroll-none bg-black ${
              storyViewer ? 'invisible pointer-events-none' : ''
            }`}
            style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
            onScroll={handleScroll}
            aria-hidden={!!storyViewer}
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
                <div className="w-8 h-8 border-2 border-[#E5E5E7] border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && feedLen === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 px-6 text-center">
                <p className="text-base font-semibold mb-1">No friend videos yet</p>
                <p className="text-xs text-white/30 mb-4">Add a photo or video story, or follow people who post</p>
                <button
                  type="button"
                  onClick={goUploadStory}
                  className="px-5 py-2 bg-[#FF3B3F] text-black rounded-full text-sm font-bold mb-3"
                >
                  Add story
                </button>
                <button
                  type="button"
                  onClick={goDiscover}
                  className="px-5 py-2 bg-white/10 text-white rounded-full text-sm font-bold"
                >
                  Discover people
                </button>
              </div>
            )}
          </div>

          {/* Story video container — inside Friends body only; separate from friend videos */}
          {storyViewer && storyItem?.mediaUrl ? (
            <div className="absolute inset-0 z-10 bg-black" data-story-container="friends">
              <FriendStorySlide
                group={storyViewer.group}
                item={storyItem}
                isActive
                onEnded={advanceStory}
              />
              <div className="absolute top-2 left-3 right-12 z-20 flex gap-1 pointer-events-none">
                {(storyViewer.group.items || []).map((it, i) => (
                  <div
                    key={it.id || i}
                    className="h-0.5 flex-1 rounded-full overflow-hidden bg-white/25"
                  >
                    <div
                      className="h-full bg-white rounded-full"
                      style={{
                        width:
                          i < storyViewer.itemIndex
                            ? '100%'
                            : i === storyViewer.itemIndex
                              ? '100%'
                              : '0%',
                        opacity: i <= storyViewer.itemIndex ? 1 : 0.35,
                      }}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={closeStoryViewer}
                className="absolute top-3 right-3 z-20 flex items-center justify-center"
                aria-label="Close story"
              >
                <RoyceBackIcon />
              </button>
              <button
                type="button"
                className="absolute left-0 top-0 bottom-0 w-1/3 z-[15] bg-transparent"
                aria-label="Previous story"
                onClick={() => {
                  setStoryViewer((prev) => {
                    if (!prev) return null;
                    if (prev.itemIndex <= 0) return null;
                    return { group: prev.group, itemIndex: prev.itemIndex - 1 };
                  });
                }}
              />
              <button
                type="button"
                className="absolute right-0 top-0 bottom-0 w-1/3 z-[15] bg-transparent"
                aria-label="Next story"
                onClick={advanceStory}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
