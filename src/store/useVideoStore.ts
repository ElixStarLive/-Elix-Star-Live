import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';
import {
  trackLike,
  trackComment,
  trackShare,
  trackFollow,
} from '../lib/interactionTracker';
import {
  apiDeleteVideo,
  apiDeleteVideoComment,
  apiFetchAllVideos,
  apiFetchFollowingIds,
  apiFetchForYouFeed,
  apiFetchFriendsFeed,
  apiFetchVideoById,
  apiPostVideoComment,
  apiToggleCommentLike,
  apiToggleFollow,
  apiToggleVideoLike,
  apiToggleVideoSave,
  apiTrackFeedView,
} from '../features/feed/feedApi';
import { showToast } from '../lib/toast';
import { getVideoPosterUrl, resolveVideoPlaybackUrl } from '../lib/bunnyStorage';
import { resolveSoundTrackPlaybackUrl } from '../lib/soundLibrary';
import { isStemExtraCaption } from '../lib/suggestiveCaption';
import { publishVideoCollection } from '../lib/videoCollectionEvents';

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error('Retry exhausted');
}

let _feedFetchPromise: Promise<void> | null = null;
/** In-memory only — not persisted. Prevents duplicate like/unlike POSTs per video. */
const likeInFlight = new Set<string>();
/** In-memory only — not persisted. Prevents duplicate save/unsave POSTs per video. */
const saveInFlight = new Set<string>();

function mapRawVideoRowToClientVideo(
  // Backend feed rows are dynamically shaped; the mapper narrows fields defensively below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  v: any,
  likedSet: Set<string>,
  savedSet: Set<string>,
  followingSet: Set<string>,
): Video {
  const u = v.user || {};
  const stats = v.stats || {};
  const music = v.music || { id: 'original', title: 'Original Sound', artist: u.name || v.displayName || 'Creator', duration: '0:15' };
  const durationStr =
    typeof v.duration === 'number' ? `0:${String(v.duration).padStart(2, '0')}` : (v.duration || '0:15');
  const id = String(v.id || '');
  const userId = String(u.id || v.userId || 'unknown');
  const locallySaved = savedSet.has(id);
  const displayName = u.name || u.username || v.displayName || v.username || 'Creator';
  return {
    id,
    url: resolveVideoPlaybackUrl(v.url || ''),
    thumbnail: v.thumbnail || getVideoPosterUrl(v.url || ''),
    duration: durationStr,
    user: {
      id: userId,
      username: u.username || u.name || v.username || 'creator',
      name: displayName,
      avatar:
        u.avatar ||
        v.avatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.slice(0, 1))}`,
      level: 1,
      isVerified: !!u.isVerified,
      followers: u.followers ?? 0,
      following: u.following ?? 0,
      isFollowing: followingSet.has(userId),
    },
    description: v.description || '',
    hashtags: Array.isArray(v.hashtags) ? v.hashtags : [],
    music: {
      id: music.id || 'original',
      title: music.title || 'Original Sound',
      artist: music.artist || 'Creator',
      duration: typeof music.duration === 'string' ? music.duration : '0:15',
      ...(music.coverUrl || music.cover_url || music.albumArt || music.image
        ? { coverUrl: String(music.coverUrl || music.cover_url || music.albumArt || music.image) }
        : {}),
      ...(music.previewUrl || music.url
        ? {
            previewUrl: resolveSoundTrackPlaybackUrl(
              String(music.previewUrl || music.url),
            ),
          }
        : {}),
      ...(typeof music.clipStartSeconds === 'number'
        ? { clipStartSeconds: music.clipStartSeconds }
        : {}),
      ...(typeof music.clipEndSeconds === 'number'
        ? { clipEndSeconds: music.clipEndSeconds }
        : {}),
      ...(music.provider ? { provider: music.provider } : {}),
      ...(typeof music.originalVolume === 'number'
        ? { originalVolume: music.originalVolume }
        : {}),
      ...(typeof music.musicVolume === 'number'
        ? { musicVolume: music.musicVolume }
        : {}),
    },
    stats: {
      views: stats.views ?? v.views ?? 0,
      likes: stats.likes ?? v.likes ?? 0,
      comments: stats.comments ?? v.comments ?? 0,
      shares: stats.shares ?? v.shares ?? 0,
      saves: Math.max(0, Number(stats.saves ?? v.saves ?? 0) || 0) + (locallySaved ? 1 : 0),
    },
    createdAt: v.createdAt || v.created_at || new Date().toISOString(),
    isLiked: likedSet.has(id) || !!v.isLiked,
    isSaved: savedSet.has(id) || !!v.isSaved,
    isFollowing: followingSet.has(userId) || !!u.isFollowing,
    comments: [],
    quality: 'auto',
    privacy: v.privacy === 'private' ? 'private' : 'public',
    ...((v.duetWithVideoId || music.duetWithVideoId)
      ? { duetWithVideoId: String(v.duetWithVideoId || music.duetWithVideoId) }
      : {}),
    ...((v.duetLayout === 'overlay' ||
      v.duetLayout === 'split' ||
      music.duetLayout === 'overlay' ||
      music.duetLayout === 'split')
      ? {
          duetLayout: (v.duetLayout === 'overlay' || music.duetLayout === 'overlay'
            ? 'overlay'
            : 'split') as 'split' | 'overlay',
        }
      : {}),
  };
}

interface User {
  id: string;
  username: string;
  name: string;
  avatar: string;
  level?: number;
  isVerified?: boolean;
  followers: number;
  following: number;
  isFollowing?: boolean;
}

interface Comment {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  text: string;
  likes: number;
  time: string;
  isLiked?: boolean;
  replies?: Comment[];
}

interface Music {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: string;
  coverUrl?: string;
  previewUrl?: string;
  clipStartSeconds?: number;
  clipEndSeconds?: number;
  provider?: string;
  /** Uploader audio mix (0..1). originalVolume = the video's own sound, musicVolume = the added track. */
  originalVolume?: number;
  musicVolume?: number;
}

interface VideoStats {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

export interface Video {
  id: string;
  url: string;
  thumbnail?: string;
  duration: string;
  user: User;
  description: string;
  hashtags: string[];
  music: Music;
  stats: VideoStats;
  createdAt: string;
  location?: string;
  isLiked: boolean;
  isSaved: boolean;
  isFollowing: boolean;
  comments: Comment[];
  quality?: 'auto' | '720p' | '1080p';
  privacy?: 'public' | 'friends' | 'private';
  duetWithVideoId?: string;
  /** split = half/half; overlay = full original with you on top */
  duetLayout?: 'split' | 'overlay';
}

interface VideoStore {
  videos: Video[];
  friendVideos: Video[];
  stemVideos: Video[];
  likedVideos: string[];
  savedVideos: string[];
  followingUsers: string[];
  /** Users you follow who also follow you — used to filter live cards on For You */
  mutualFollowIds: string[];
  loading: boolean;
  friendsLoading: boolean;
  stemLoading: boolean;
  /** For You pagination — backend hasMore from GET /api/feed/foryou */
  forYouPage: number;
  forYouHasMore: boolean;
  
  // Video actions
  fetchVideos: () => Promise<void>;
  fetchMoreForYou: () => Promise<void>;
  fetchFriendVideos: () => Promise<void>;
  fetchStemVideos: () => Promise<void>;
  /** Load a single video from API when missing from store (deep link / shared /video/:id). Returns true if loaded. */
  fetchVideoById: (videoId: string) => Promise<boolean>;
  getVideoById: (videoId: string) => Video | undefined;
  addVideo: (video: Video) => void;
  removeVideo: (videoId: string) => void;
  updateVideo: (videoId: string, updates: Partial<Video>) => void;
  deleteVideo: (videoId: string) => Promise<void>;
  
  // Like actions
  toggleLike: (videoId: string) => void | Promise<void>;
  getLikedVideos: () => Video[];
  
  // Save actions
  toggleSave: (videoId: string) => void;
  getSavedVideos: () => Video[];
  
  // Follow actions
  toggleFollow: (userId: string) => void;
  getFollowingUsers: () => User[];
  
  // Share actions
  shareVideo: (videoId: string) => void | Promise<void>;

  // Comment actions
  addComment: (videoId: string, comment: Omit<Comment, 'id' | 'time'>) => void | Promise<void>;
  deleteComment: (videoId: string, commentId: string) => void;
  toggleCommentLike: (videoId: string, commentId: string) => void;
  
  // Analytics
  incrementViews: (videoId: string) => void | Promise<void>;
  getTrendingVideos: () => Video[];
  getRecommendedVideos: (userId: string) => Video[];
}

export const useVideoStore = create<VideoStore>()(
  persist(
    (set, get) => ({
      videos: [],
      friendVideos: [],
      stemVideos: [],
      likedVideos: [],
      savedVideos: [],
      followingUsers: [],
      mutualFollowIds: [],
      loading: false,
      friendsLoading: false,
      stemLoading: false,
      forYouPage: 1,
      forYouHasMore: false,

      getVideoById: (videoId: string) => {
        const { friendVideos, videos, stemVideos } = get();
        return (
          friendVideos.find((v) => v.id === videoId) ??
          videos.find((v) => v.id === videoId) ??
          stemVideos.find((v) => v.id === videoId)
        );
      },

      fetchVideoById: async (videoId: string) => {
        const id = String(videoId || '').trim();
        if (!id) return false;
        if (get().getVideoById(id)) return true;
        try {
          const { video: raw, error } = await apiFetchVideoById(id);
          if (error || !raw) return false;
          const url = raw?.url != null ? String(raw.url).trim() : '';
          if (!url) return false;
          const { likedVideos, savedVideos, followingUsers } = get();
          const likedSet = new Set(likedVideos);
          const savedSet = new Set(savedVideos);
          const followingSet = new Set(followingUsers);
          const mapped = mapRawVideoRowToClientVideo(raw, likedSet, savedSet, followingSet);
          set((state) => {
            const idx = state.videos.findIndex((v) => v.id === mapped.id);
            if (idx >= 0) {
              const next = [...state.videos];
              next[idx] = mapped;
              return { videos: next };
            }
            return { videos: [mapped, ...state.videos] };
          });
          return true;
        } catch {
          return false;
        }
      },

      fetchVideos: async () => {
        if (_feedFetchPromise) return _feedFetchPromise;
        const doFetch = async () => {
        set({ loading: true });
        try {
          const pageJson = await withRetry(() => apiFetchForYouFeed(1, 50));
          const apiVideos = Array.isArray(pageJson?.videos) ? pageJson.videos : [];
          const mutualFromApi = Array.isArray(pageJson?.mutualUserIds) ? pageJson.mutualUserIds : [];
          const authUser = useAuthStore.getState().user;
          if (authUser?.id) {
            try {
              const { following: ids, error: followError } = await apiFetchFollowingIds(authUser.id);
              if (!followError) {
                set({ followingUsers: ids });
              }
            } catch {
              /* keep persisted followingUsers */
            }
          }

          const { likedVideos, savedVideos, followingUsers } = get();
          const likedSet = new Set(likedVideos);
          const savedSet = new Set(savedVideos);
          const followingSet = new Set(followingUsers);

          const toClientVideo = (v: unknown) =>
            mapRawVideoRowToClientVideo(v, likedSet, savedSet, followingSet);

          // Use all real backend videos. If backend is empty, show empty state.
          // Never show 24h story CDN clips in For You — those are not FYP videos.
          const hasApiVideos = Array.isArray(apiVideos) && apiVideos.length > 0;
          const sourceVideos = hasApiVideos
            ? (apiVideos as NonNullable<typeof apiVideos>).filter((raw) => {
                const row = raw as { url?: string; video_url?: string };
                const url = String(row.url || row.video_url || '');
                return !url.includes('/stories/');
              })
            : [];

          const mappedVideos: Video[] = sourceVideos.map(toClientVideo);

          /* For You = /api/feed/foryou (ranked stages). Do not merge friends-only here. */
          set({
            videos: mappedVideos,
            mutualFollowIds: mutualFromApi,
            loading: false,
            forYouPage: 1,
            forYouHasMore: Boolean(pageJson?.hasMore),
          });
        } catch {
          set({ loading: false });
          if (!navigator.onLine) showToast('No internet connection');
          else showToast('Failed to load feed. Pull down to retry.');
        }
        };
        _feedFetchPromise = doFetch().finally(() => { _feedFetchPromise = null; });
        return _feedFetchPromise;
      },

      fetchMoreForYou: async () => {
        const { forYouHasMore, forYouPage, loading, videos } = get();
        if (!forYouHasMore || loading) return;
        const nextPage = forYouPage + 1;
        set({ loading: true });
        try {
          const pageJson = await withRetry(() => apiFetchForYouFeed(nextPage, 50));
          const apiVideos = Array.isArray(pageJson?.videos) ? pageJson.videos : [];
          const { likedVideos, savedVideos, followingUsers } = get();
          const likedSet = new Set(likedVideos);
          const savedSet = new Set(savedVideos);
          const followingSet = new Set(followingUsers);
          const existing = new Set(videos.map((v) => v.id));
          const mapped = apiVideos
            .filter((raw) => {
              const row = raw as { id?: string; url?: string; video_url?: string };
              const id = String(row.id || '');
              if (!id || existing.has(id)) return false;
              const url = String(row.url || row.video_url || '');
              return !url.includes('/stories/');
            })
            .map((v) => mapRawVideoRowToClientVideo(v, likedSet, savedSet, followingSet));
          set({
            videos: [...videos, ...mapped],
            forYouPage: nextPage,
            forYouHasMore: Boolean(pageJson?.hasMore),
            loading: false,
          });
        } catch {
          set({ loading: false });
        }
      },

      fetchStemVideos: async () => {
        set({ stemLoading: true });
        try {
          const { likedVideos, savedVideos, followingUsers } = get();
          const likedSet = new Set(likedVideos);
          const savedSet = new Set(savedVideos);
          const followingSet = new Set(followingUsers);

          const { videos: rawList, error } = await apiFetchAllVideos();
          if (error) {
            set({ stemVideos: [], stemLoading: false });
            return;
          }
          const eligible = rawList.filter((v: { privacy?: string; url?: string }) => {
            if (v.privacy === 'private') return false;
            return !!(v.url || '').toString().trim();
          });
          const mapped = eligible.map((v: unknown) =>
            mapRawVideoRowToClientVideo(v, likedSet, savedSet, followingSet),
          );
          const byViews = [...mapped].sort((a, b) => (b.stats.views ?? 0) - (a.stats.views ?? 0));

          /* Global trending by views first (like Explore), then extra suggestive / indecentish slots */
          const topTrending = byViews.slice(0, 40);
          const seen = new Set(topTrending.map((x) => x.id));
          const extraPool = byViews.filter(
            (x) =>
              !seen.has(x.id) &&
              isStemExtraCaption(x.description, x.hashtags),
          );
          const stemList = [...topTrending, ...extraPool.slice(0, 20)].slice(0, 55);

          set({ stemVideos: stemList, stemLoading: false });
        } catch {
          set({ stemLoading: false });
        }
      },

      fetchFriendVideos: async () => {
        set({ friendsLoading: true });
        try {
          const authUser = useAuthStore.getState().user;
          if (!authUser?.id) {
            set({ friendsLoading: false });
            return;
          }

          // First load who we follow so followingUsers is up to date
          const { following: ids, error: followListErr } = await apiFetchFollowingIds(authUser.id);
          if (!followListErr) {
            set({ followingUsers: ids });
          }

          /* Server unions following ∪ followers; do not skip when following list is empty */
          const { followingUsers } = get();

          const { videos: apiVideos, error } = await apiFetchFriendsFeed();
          if (error) {
            set({ friendsLoading: false });
            return;
          }
          if (apiVideos.length === 0) {
            set({ friendVideos: [], friendsLoading: false });
            return;
          }

          const { likedVideos, savedVideos } = get();
          const likedSet = new Set(likedVideos);
          const savedSet = new Set(savedVideos);
          const followingSet = new Set(followingUsers);

          const mappedVideos: Video[] = apiVideos.map((v: unknown) =>
            mapRawVideoRowToClientVideo(v, likedSet, savedSet, followingSet),
          );
          set({ friendVideos: mappedVideos, friendsLoading: false });
        } catch {
          set({ friendsLoading: false });
          if (!navigator.onLine) showToast('No internet connection');
        }
      },

      // Video actions
      addVideo: (video) => set((state) => ({ 
        videos: [video, ...state.videos] 
      })),
      
      removeVideo: (videoId) => set((state) => ({
        videos: state.videos.filter(video => video.id !== videoId)
      })),
      
      updateVideo: (videoId, updates) => set((state) => {
        const upd = (video: Video) => video.id === videoId ? { ...video, ...updates } : video;
        return {
          videos: state.videos.map(upd),
          friendVideos: state.friendVideos.map(upd),
        };
      }),

      deleteVideo: async (videoId) => {
        const snapshot = get();
        try {
          const authUser = useAuthStore.getState().user;
          if (!authUser?.id) {
            throw new Error('Please sign in to delete videos.');
          }

          const { ok, error } = await apiDeleteVideo(videoId);

          if (!ok || error) {
            throw new Error(error || 'Failed to delete video');
          }

          set((s) => ({ videos: s.videos.filter((v) => v.id !== videoId), friendVideos: s.friendVideos.filter((v) => v.id !== videoId) }));
        } catch (err) {
          set({ videos: snapshot.videos, friendVideos: snapshot.friendVideos });
          throw err instanceof Error ? err : new Error('Failed to delete video.');
        }
      },

      // Like actions (persist to server + update video engagement / FYP eligibility)
      toggleLike: async (videoId) => {
        const authUser = useAuthStore.getState().user;
        if (!authUser?.id) return;
        // One in-flight like/unlike per video — blocks double-tap duplicate POSTs.
        if (likeInFlight.has(videoId)) return;

        const state = get();
        const video = state.getVideoById(videoId);
        if (!video) return;

        const wasLiked = video.isLiked;
        const nextLiked = !wasLiked;
        const newLikes = Math.max(0, wasLiked ? video.stats.likes - 1 : video.stats.likes + 1);
        const updatedStats = { ...video.stats, likes: newLikes };

        const newLikedVideos = wasLiked
          ? state.likedVideos.filter(id => id !== videoId)
          : [...state.likedVideos, videoId];

        const likeUpdate = (v: Video) => v.id === videoId ? { ...v, isLiked: nextLiked, stats: updatedStats } : v;
        set({
          videos: state.videos.map(likeUpdate),
          friendVideos: state.friendVideos.map(likeUpdate),
          likedVideos: newLikedVideos
        });
        publishVideoCollection({ type: 'liked', videoId, liked: nextLiked });

        likeInFlight.add(videoId);
        try {
          const { ok, error } = await apiToggleVideoLike(videoId, wasLiked);
          if (!ok || error) throw new Error('Like failed');

          // Analytics best-effort — like already succeeded on the server.
          if (!wasLiked) {
            void trackLike(videoId).catch(() => {
              /* non-critical analytics */
            });
          }
        } catch {
          const originalLikes = video.stats.likes;
          const revert = (v: Video) => v.id === videoId
            ? { ...v, isLiked: wasLiked, stats: { ...v.stats, likes: originalLikes } }
            : v;
          set((s) => ({
            videos: s.videos.map(revert),
            friendVideos: s.friendVideos.map(revert),
            likedVideos: wasLiked ? [...s.likedVideos, videoId] : s.likedVideos.filter(id => id !== videoId),
          }));
          publishVideoCollection({ type: 'liked', videoId, liked: wasLiked });
          showToast(wasLiked ? 'Couldn’t unlike. Please try again.' : 'Couldn’t like. Please try again.');
        } finally {
          likeInFlight.delete(videoId);
        }
      },

      getLikedVideos: () => {
        const { videos, likedVideos } = get();
        return videos.filter(video => likedVideos.includes(video.id));
      },

      // Save actions — persist to server
      toggleSave: async (videoId) => {
        const authUser = useAuthStore.getState().user;
        if (!authUser?.id) return;
        if (saveInFlight.has(videoId)) return;

        const state = get();
        const video = state.getVideoById(videoId);
        if (!video) return;

        const wasSaved = video.isSaved;
        const nextSaved = !wasSaved;
        const newSavedVideos = wasSaved
          ? state.savedVideos.filter(id => id !== videoId)
          : [...state.savedVideos, videoId];

        const newSaves = Math.max(0, wasSaved ? (video.stats.saves || 0) - 1 : (video.stats.saves || 0) + 1);
        const saveUpdate = (v: Video) => v.id === videoId
          ? { ...v, isSaved: nextSaved, stats: { ...v.stats, saves: newSaves } }
          : v;
        set({
          videos: state.videos.map(saveUpdate),
          friendVideos: state.friendVideos.map(saveUpdate),
          savedVideos: newSavedVideos,
        });
        publishVideoCollection({ type: 'saved', videoId, saved: nextSaved });

        saveInFlight.add(videoId);
        try {
          const { ok, error: saveError } = await apiToggleVideoSave(videoId, wasSaved);
          if (!ok || saveError) throw new Error('Save failed');
        } catch {
          const originalSaves = video.stats.saves || 0;
          const revert = (v: Video) => v.id === videoId
            ? { ...v, isSaved: wasSaved, stats: { ...v.stats, saves: originalSaves } }
            : v;
          set((s) => ({
            videos: s.videos.map(revert),
            friendVideos: s.friendVideos.map(revert),
            savedVideos: wasSaved ? [...s.savedVideos, videoId] : s.savedVideos.filter(id => id !== videoId),
          }));
          publishVideoCollection({ type: 'saved', videoId, saved: wasSaved });
          showToast(wasSaved ? 'Couldn’t unsave. Please try again.' : 'Couldn’t save. Please try again.');
        } finally {
          saveInFlight.delete(videoId);
        }
      },

      getSavedVideos: () => {
        const { videos, savedVideos } = get();
        return videos.filter(video => savedVideos.includes(video.id));
      },

      // Follow actions
      toggleFollow: async (userId) => {
        const state = get();
        const wasFollowing = state.followingUsers.includes(userId);

        const revert = () => {
          set((s) => {
            const followUpdate = (video: Video) => video.user.id === userId
              ? {
                  ...video,
                  isFollowing: wasFollowing,
                  user: {
                    ...video.user,
                    followers: wasFollowing ? video.user.followers + 1 : Math.max(0, video.user.followers - 1),
                  },
                }
              : video;
            const followingUsers = wasFollowing ? [...s.followingUsers, userId] : s.followingUsers.filter(id => id !== userId);
            return {
              videos: s.videos.map(followUpdate),
              friendVideos: s.friendVideos.map(followUpdate),
              followingUsers
            };
          });
        };

        const authUser = useAuthStore.getState().user;
        if (!authUser?.id) {
          showToast('Please sign in to follow');
          return;
        }
        if (authUser.id === userId) return;

        // Optimistic update
        set((s) => {
          const newFollowingUsers = s.followingUsers.includes(userId)
            ? s.followingUsers.filter(id => id !== userId)
            : [...s.followingUsers, userId];
          const followUpdate = (video: Video) => video.user.id === userId
            ? {
                ...video,
                isFollowing: !video.isFollowing,
                user: {
                  ...video.user,
                  followers: video.isFollowing ? video.user.followers - 1 : video.user.followers + 1
                }
              }
            : video;
          return {
            videos: s.videos.map(followUpdate),
            friendVideos: s.friendVideos.map(followUpdate),
            followingUsers: newFollowingUsers
          };
        });

        try {
          const { ok, error: followError } = await apiToggleFollow(userId, wasFollowing);
          if (!ok || followError) throw new Error('Follow request failed');
          // Analytics best-effort — follow already succeeded on the server.
          if (!wasFollowing) {
            void trackFollow(userId).catch(() => {
              /* non-critical analytics */
            });
          }
        } catch {
          revert();
          showToast('Couldn’t follow. Please try again.');
        }
      },

      getFollowingUsers: () => {
        const { videos, followingUsers } = get();
        return videos
          .map(video => video.user)
          .filter(user => followingUsers.includes(user.id));
      },

      // Share actions – increment share count + refresh FYP eligibility
      shareVideo: async (videoId) => {
        const state = get();
        const video = state.getVideoById(videoId);
        if (!video) return;

        const prevShares = video.stats.shares;
        const newShares = prevShares + 1;
        const updatedStats = { ...video.stats, shares: newShares };
        const shareUpdate = (v: Video) => v.id === videoId ? { ...v, stats: updatedStats } : v;
        const revertShare = (v: Video) =>
          v.id === videoId ? { ...v, stats: { ...v.stats, shares: prevShares } } : v;
        set({
          videos: state.videos.map(shareUpdate),
          friendVideos: state.friendVideos.map(shareUpdate),
        });

        try {
          await trackShare(videoId);
        } catch {
          set((s) => ({
            videos: s.videos.map(revertShare),
            friendVideos: s.friendVideos.map(revertShare),
          }));
          showToast('Couldn’t record share. Please try again.');
        }
      },

      addComment: async (videoId, commentData) => {
        const state = get();
        const video = state.getVideoById(videoId);
        if (!video) return;

        const authUser = useAuthStore.getState().user;
        if (!authUser?.id) return;

        // Optimistic update
        const tempId = `comment_${Date.now()}`;
        const newComment: Comment = {
          ...commentData,
          id: tempId,
          userId: authUser.id,
          username: authUser.username || authUser.email?.split('@')[0] || 'user',
          avatar: authUser.avatar || `https://ui-avatars.com/api/?name=${authUser.name || 'User'}`,
          time: 'just now',
          likes: 0,
          isLiked: false
        };
        
        const newCommentsCount = video.stats.comments + 1;
        const updatedStats = { ...video.stats, comments: newCommentsCount };
        const commentUpdate = (v: Video) => v.id === videoId
          ? { ...v, comments: [...v.comments, newComment], stats: updatedStats }
          : v;
        set({
          videos: state.videos.map(commentUpdate),
          friendVideos: state.friendVideos.map(commentUpdate),
        });

        try {
          const { comment, error: commentError } = await apiPostVideoComment(
            videoId,
            commentData.text,
            (commentData as { parentId?: string }).parentId || null,
          );

          if (commentError) throw new Error('Comment failed');

          if (comment?.id) {
            const realId = String(comment.id);
            const commentIdUpdate = (v: Video) => v.id === videoId
              ? { ...v, comments: v.comments.map(c => c.id === tempId ? { ...c, id: realId } : c) }
              : v;
            set(s => ({
              videos: s.videos.map(commentIdUpdate),
              friendVideos: s.friendVideos.map(commentIdUpdate),
            }));
          }

          // Analytics best-effort — comment already succeeded on the server.
          void trackComment(videoId, commentData.text).catch(() => {
            /* non-critical analytics */
          });
        } catch {
          /* revert optimistic update on failure */
          set(s => ({
            videos: s.videos.map(v => v.id === videoId
              ? { ...v, comments: v.comments.filter(c => c.id !== tempId), stats: { ...v.stats, comments: Math.max(0, v.stats.comments - 1) } }
              : v),
            friendVideos: s.friendVideos.map(v => v.id === videoId
              ? { ...v, comments: v.comments.filter(c => c.id !== tempId), stats: { ...v.stats, comments: Math.max(0, v.stats.comments - 1) } }
              : v),
          }));
          showToast('Couldn’t post comment. Please try again.');
        }
      },

      deleteComment: async (videoId, commentId) => {
        const state = get();
        const video = state.getVideoById(videoId);
        if (!video) return;
        const removed = video.comments.find((c) => c.id === commentId);
        if (!removed) return;

        const commentDelUpdate = (v: Video) => v.id === videoId
          ? {
              ...v,
              comments: v.comments.filter(c => c.id !== commentId),
              stats: { ...v.stats, comments: Math.max(0, v.stats.comments - 1) }
            }
          : v;
        const revertDel = (v: Video) =>
          v.id === videoId
            ? {
                ...v,
                comments: [...v.comments, removed],
                stats: { ...v.stats, comments: v.stats.comments + 1 },
              }
            : v;
        set({
          videos: state.videos.map(commentDelUpdate),
          friendVideos: state.friendVideos.map(commentDelUpdate),
        });
        try {
          const { ok, error } = await apiDeleteVideoComment(videoId, commentId);
          if (!ok || error) throw new Error(error);
        } catch {
          set((s) => ({
            videos: s.videos.map(revertDel),
            friendVideos: s.friendVideos.map(revertDel),
          }));
          showToast('Couldn’t delete comment. Please try again.');
        }
      },

      toggleCommentLike: async (videoId, commentId) => {
        const state = get();
        const video = state.getVideoById(videoId);
        if (!video) return;
        
        const comment = video.comments.find(c => c.id === commentId);
        if (!comment) return;

        const wasLiked = comment.isLiked;
        const commentLikeUpdate = (v: Video) => v.id === videoId
          ? {
              ...v,
              comments: v.comments.map(c =>
                c.id === commentId
                  ? { ...c, isLiked: !wasLiked, likes: wasLiked ? c.likes - 1 : c.likes + 1 }
                  : c
              )
            }
          : v;
        set((s) => ({
          videos: s.videos.map(commentLikeUpdate),
          friendVideos: s.friendVideos.map(commentLikeUpdate),
        }));

        const action = wasLiked ? 'unlike' : 'like';
        const revertLike = (v: Video) =>
          v.id === videoId
            ? {
                ...v,
                comments: v.comments.map((c) =>
                  c.id === commentId
                    ? { ...c, isLiked: wasLiked, likes: wasLiked ? c.likes + 1 : c.likes - 1 }
                    : c,
                ),
              }
            : v;
        try {
          const { ok, error } = await apiToggleCommentLike(videoId, commentId, action);
          if (!ok || error) throw new Error(error);
        } catch {
          set((s) => ({
            videos: s.videos.map(revertLike),
            friendVideos: s.friendVideos.map(revertLike),
          }));
          showToast('Couldn’t update comment like. Please try again.');
        }
      },

      // Analytics — one public view per viewer per video (scroll-back must not +1 again)
      incrementViews: async (videoId) => {
        const state = get();
        const video = state.getVideoById(videoId);
        if (!video) return;

        const SESSION_KEY = 'elix_viewed_videos_v1';
        let viewed = new Set<string>();
        try {
          const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null;
          if (raw) {
            const arr = JSON.parse(raw) as unknown;
            if (Array.isArray(arr)) viewed = new Set(arr.map(String));
          }
        } catch {
          viewed = new Set();
        }
        if (viewed.has(videoId)) return;

        viewed.add(videoId);
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify([...viewed].slice(-500)));
          }
        } catch {
          /* ignore quota */
        }

        try {
          const { ok, counted } = await apiTrackFeedView(videoId);
          if (!ok || !counted) return;

          const latest = get().getVideoById(videoId);
          if (!latest) return;
          const newViews = latest.stats.views + 1;
          const viewsUpdate = (v: Video) =>
            v.id === videoId ? { ...v, stats: { ...v.stats, views: newViews } } : v;
          set((s) => ({
            videos: s.videos.map(viewsUpdate),
            friendVideos: s.friendVideos.map(viewsUpdate),
          }));
        } catch {
          /* view analytics must not block feed */
        }
      },

      getTrendingVideos: () => {
        const { videos } = get();
        return [...videos].sort((a, b) => {
          const engagementA = (a.stats.likes + a.stats.comments + a.stats.shares) / (a.stats.views || 1);
          const engagementB = (b.stats.likes + b.stats.comments + b.stats.shares) / (b.stats.views || 1);
          return engagementB - engagementA;
        });
      },

      getRecommendedVideos: (userId: string) => {
        const { videos, likedVideos } = get();
        return videos
          .filter(video => !likedVideos.includes(video.id) && video.user.id !== userId)
          .slice(0, 10);
      }
    }),
    {
      name: 'video-store-v6',
      partialize: (state) => ({
        videos: state.videos,
        friendVideos: state.friendVideos,
        likedVideos: state.likedVideos,
        savedVideos: state.savedVideos,
        followingUsers: state.followingUsers
      })
    }
  )
);
