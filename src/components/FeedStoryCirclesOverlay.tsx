import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RoyceBackIcon } from './royce';
import { StoryGoldRingAvatar } from './StoryGoldRingAvatar';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import { apiFetchProfiles } from '../features/feed/feedApi';
import { fetchActiveStories, type StoryItem, type StoryUserGroup } from '../lib/storiesApi';
import { prepareFeedVideoEl } from '../lib/prepareLiveVideoEl';
import { apiLiveStreams, collectLiveUserIds, connectLiveFeedPresence } from '../lib/live';
import { usePullRevealStrip } from '../hooks/usePullRevealStrip';
import { isGenuineAppUser } from '../lib/genuineUser';
import { FEED_HOME } from '../lib/settingsNav';
import { reportFailure } from '../lib/reportFailure';

interface SuggestedUser {
  id: string;
  username: string;
  name: string;
  avatar_url?: string;
  is_live?: boolean;
}

const STORY_IMAGE_MS = 5000;

function StorySlide({
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

type Props = {
  /** Parent page root — used for page-level push-down / push-up capture. */
  pageRef: React.RefObject<HTMLElement | null>;
  /** Optional top offset so strip sits below a fixed header (overlay layout only). */
  topOffset?: string;
  /**
   * `overlay` — absolute over video feeds (STEM / Friends-style).
   * `inline` — in-document full panel width row (Explore); does not cover search/tabs.
   */
  layout?: 'overlay' | 'inline';
  /** Start with circles visible (Following). */
  initiallyVisible?: boolean;
  /** Put accounts the viewer follows first, then everyone else. */
  followingFirst?: boolean;
  /** Page name shown in the strip chrome (comes down with the strip, not on video). */
  title?: string;
  onSearch?: () => void;
  onBack?: () => void;
};

/**
 * Friends-style story circles: hidden by default, push down to show, push up to hide.
 * Search / title / back live on the strip panel — not over the video when tucked away.
 */
export function FeedStoryCirclesOverlay({
  pageRef,
  topOffset: _topOffset,
  layout = 'overlay',
  initiallyVisible = false,
  followingFirst = false,
  title,
  onSearch,
  onBack,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const token = useAuthStore((s) => s.session?.access_token) ?? '';
  const followingIds = useVideoStore((s) => s.followingUsers);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [storyGroups, setStoryGroups] = useState<StoryUserGroup[]>([]);
  /** Host/user ids currently live — drives live ring on story + suggestion circles. */
  const [liveUserIds, setLiveUserIds] = useState<Set<string>>(() => new Set());
  const [storyViewer, setStoryViewer] = useState<{
    group: StoryUserGroup;
    itemIndex: number;
  } | null>(null);

  const { visible, pullZoneProps } = usePullRevealStrip(pageRef, {
    disabled: !!storyViewer,
    initiallyVisible,
  });

  const goUploadStory = useCallback(() => {
    navigate('/upload?type=story');
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
    void fetchActiveStories()
      .then(setStoryGroups)
      .catch(() => {
        /* keep previous groups — do not fake empty success */
      });
  }, []);

  useEffect(() => {
    reloadStories();
    const onFocus = () => reloadStories();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [reloadStories]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const [profilesResult, liveResult] = await Promise.all([
          apiFetchProfiles(),
          apiLiveStreams(),
        ]);
        if (liveResult.error) {
          reportFailure('feed_story_live_streams', new Error(liveResult.error));
          /* keep prior liveUserIds / suggestedUsers — do not fake empty success */
          return;
        }
        const profilesBody = { profiles: profilesResult.profiles ?? [] };
        const liveBody = { streams: liveResult.streams ?? [] };
        const liveSet = collectLiveUserIds(liveBody.streams || []);
        setLiveUserIds(liveSet);

        const rows = Array.isArray(profilesBody?.profiles) ? profilesBody.profiles : [];
        const followingSet = new Set(followingIds || []);
        const mapped: SuggestedUser[] = rows
          .map(
            (p: {
              user_id: string;
              userId: string;
              username?: string;
              display_name?: string;
              displayName?: string;
              avatar_url?: string;
              avatarUrl?: string;
            }) => ({
              id: p.user_id || p.userId,
              username: p.username || 'user',
              name: p.display_name || p.displayName || p.username || 'User',
              avatar_url: p.avatar_url || p.avatarUrl,
              is_live: liveSet.has(String(p.user_id || p.userId || '')),
            }),
          )
          .filter((p) => !!p.id && p.id !== user?.id)
          .filter((p) => isGenuineAppUser(p.username, p.id, p.name));

        mapped.sort((a, b) => {
          if (followingFirst) {
            const aF = followingSet.has(a.id) ? 0 : 1;
            const bF = followingSet.has(b.id) ? 0 : 1;
            if (aF !== bF) return aF - bF;
          }
          if (a.is_live === b.is_live) return 0;
          return a.is_live ? -1 : 1;
        });
        setSuggestedUsers(mapped);
      } catch (e) {
        reportFailure('feed_story_users', e);
        /* keep prior suggestedUsers / liveUserIds — do not fake empty success */
      }
    };

    void fetchUsers();
    const disposePresence = token
      ? connectLiveFeedPresence(token, {
          onStreamStarted: () => {
            void fetchUsers();
          },
          onStreamEnded: () => {
            void fetchUsers();
          },
        })
      : () => {};
    return () => {
      disposePresence();
    };
  }, [user?.id, followingFirst, (followingIds || []).join(','), token]);

  const ownStory = user?.id ? storyGroups.find((g) => g.userId === user.id) : undefined;

  const openUserStory = (userId: string) => {
    const group = storyGroups.find((g) => g.userId === userId);
    if (!group?.items?.length) return;
    setStoryViewer({ group, itemIndex: 0 });
  };

  const storyItem = storyViewer ? storyViewer.group.items[storyViewer.itemIndex] : null;

  const advanceStory = useCallback(() => {
    setStoryViewer((prev) => {
      if (!prev) return null;
      const next = prev.itemIndex + 1;
      if (next >= (prev.group.items?.length || 0)) return null;
      return { group: prev.group, itemIndex: next };
    });
  }, []);

  const stripShown = visible && !storyViewer;

  const goSearchDefault = useCallback(() => {
    navigate('/search');
  }, [navigate]);

  const goBackDefault = useCallback(() => {
    navigate(FEED_HOME, { replace: true });
  }, [navigate]);

  const handleSearch = onSearch || goSearchDefault;
  const handleBack = onBack || goBackDefault;
  const showChrome = !!title;

  const stripChrome = showChrome ? (
    <div
      className="w-full px-3 flex items-center justify-between pointer-events-auto"
      style={{ minHeight: 'var(--topnav-bar-height)' }}
    >
      <button type="button" onClick={handleSearch} className="p-1" aria-label="Search">
        <Search size={18} className="text-white" />
      </button>
      <h1 className="elix-silver-red-text text-sm font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{title}</h1>
      <button type="button" onClick={handleBack} className="p-1" title="Back">
        <RoyceBackIcon />
      </button>
    </div>
  ) : null;

  const circlesRow = (
    <div
      className="w-full flex gap-3 overflow-x-auto overflow-y-visible no-scrollbar min-h-[78px]"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <button
        type="button"
        onClick={() => {
          if (ownStory?.items?.length) openUserStory(ownStory.userId);
          else goUploadStory();
        }}
        className="flex-shrink-0 flex flex-col items-center gap-0.5"
        style={{ width: 80, minWidth: 80 }}
        title="Add story"
      >
        <div className="relative overflow-visible" style={{ width: 58, height: 58 }}>
          <StoryGoldRingAvatar
            size={58}
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
            className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#E6E9EE] border-2 border-black flex items-center justify-center z-10"
          >
            <Plus size={9} className="text-black" strokeWidth={3} />
          </span>
        </div>
        <div className="elix-silver-red-text text-[10px] truncate w-full text-center leading-tight">
          {ownStory?.items?.length ? 'Your story' : 'Add story'}
        </div>
      </button>
      {storyGroups
        .filter((g) => g.userId !== user?.id && (g.items?.length ?? 0) > 0)
        .map((g) => {
          const isLive = liveUserIds.has(g.userId);
          return (
          <button
            key={`story-${g.userId}`}
            type="button"
            onClick={() => {
              if (isLive) openUserOrLive(g.userId, true);
              else openUserStory(g.userId);
            }}
            className="flex-shrink-0 flex flex-col items-center gap-0.5"
            style={{ width: 80, minWidth: 80 }}
            title={g.displayName || g.username}
          >
            <StoryGoldRingAvatar
              size={58}
              live={isLive}
              data-avatar-circle={isLive ? 'live' : undefined}
              src={g.avatar || '/royce/default-avatar.svg'}
              alt={g.displayName || g.username || ''}
            />
            <div className="elix-silver-red-text text-[10px] truncate w-full text-center leading-tight">
              {g.displayName || g.username}
            </div>
          </button>
          );
        })}
      {suggestedUsers
        .filter((u) => !storyGroups.some((g) => g.userId === u.id && (g.items?.length ?? 0) > 0))
        .map((u) => {
          const isLive = !!u.is_live || liveUserIds.has(u.id);
          return (
          <button
            key={u.id}
            type="button"
            onClick={() => openUserOrLive(u.id, isLive)}
            className="flex-shrink-0 flex flex-col items-center gap-0.5"
            style={{ width: 80, minWidth: 80 }}
          >
            <StoryGoldRingAvatar
              size={58}
              live={isLive}
              data-avatar-circle={isLive ? 'live' : undefined}
              src={u.avatar_url || '/royce/default-avatar.svg'}
              alt={u.name || u.username}
            />
            <div className="elix-silver-red-text text-[10px] truncate w-full text-center leading-tight">
              {u.name || u.username}
            </div>
          </button>
          );
        })}
    </div>
  );

  const storyPlayer =
    storyViewer && storyItem?.mediaUrl ? (
      <div
        className={`${layout === 'inline' ? 'fixed' : 'absolute'} inset-0 z-[40] bg-black`}
        data-story-container="feed-overlay"
      >
        <StorySlide
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
                className="h-full bg-[#E6E9EE] elix-progress-fill rounded-full"
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
    ) : null;

  if (layout === 'inline') {
    return (
      <>
        {!visible && !storyViewer ? (
          <div {...pullZoneProps} className="relative w-full h-3 shrink-0 z-[5]" />
        ) : null}
        <div
          className={`w-full shrink-0 overflow-hidden transition-[max-height,opacity] duration-300 ease-out feed-story-strip ${
            stripShown
              ? 'max-h-[160px] opacity-100'
              : 'max-h-0 opacity-0 pointer-events-none'
          }`}
          aria-hidden={!stripShown}
        >
          {stripChrome}
          <div className="w-full px-3 pt-0 pb-1 pointer-events-auto">{circlesRow}</div>
        </div>
        {storyPlayer}
      </>
    );
  }

  return (
    <>
      {!visible && !storyViewer ? <div {...pullZoneProps} /> : null}

      {/*
        Fixed under status bar, but fundal width = app column (same as video/bottom nav).
        Open on STEM / Following / Friends; push up hides rings to watch video.
      */}
      <div
        className={`fixed inset-x-0 top-0 z-[20] flex justify-center pointer-events-none transition-[transform,opacity] duration-300 ease-out ${
          stripShown
            ? 'translate-y-0 opacity-100'
            : '-translate-y-[120%] opacity-0 invisible pointer-events-none'
        }`}
        aria-hidden={!stripShown}
      >
        <div
          className={`feed-column-width w-full feed-story-strip ${
            stripShown ? 'overflow-visible' : 'overflow-hidden'
          }`}
          style={{ paddingTop: 'var(--safe-top)' }}
        >
          {stripChrome}
          <div className="px-4 pt-0 pb-1 overflow-visible pointer-events-auto">{circlesRow}</div>
        </div>
      </div>

      {storyPlayer}
    </>
  );
}
