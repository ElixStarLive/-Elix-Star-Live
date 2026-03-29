import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';
import { request } from '../lib/apiClient';
import {
  calculateEngagementScore,
  isEligibleForFyp,
  refreshVideoFypStatus,
} from '../lib/fypEligibility';
import {
  fetchForYouFeed,
  trackLike,
  trackComment,
  trackShare,
  trackFollow,
} from '../lib/interactionTracker';
import { showToast } from '../lib/toast';
import { getVideoPosterUrl } from '../lib/bunnyStorage';
import { isStemExtraCaption } from '../lib/suggestiveCaption';

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

function mapRawVideoRowToClientVideo(
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
    url: v.url,
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
    ...(v.duetWithVideoId ? { duetWithVideoId: String(v.duetWithVideoId) } : {}),
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
  
  // Video actions
  fetchVideos: () => Promise<void>;
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
          const { data: raw, error } = await request(`/api/videos/${encodeURIComponent(id)}`);
          if (error) return false;
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
          const pageJson = await withRetry(() => fetchForYouFeed(1, 50));
          const apiVideos = Array.isArray(pageJson?.videos) ? pageJson.videos : [];
          const mutualFromApi = Array.isArray(pageJson?.mutualUserIds) ? pageJson.mutualUserIds : [];
          const authUser = useAuthStore.getState().user;
          if (authUser?.id) {
            try {
              const { data: followBody, error: followError } = await request(`/api/profiles/${encodeURIComponent(authUser.id)}/following`);
              if (!followError) {
                const ids: string[] = Array.isArray(followBody?.following) ? followBody.following : [];
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

          const toClientVideo = (v: any) =>
            mapRawVideoRowToClientVideo(v, likedSet, savedSet, followingSet);

          // Use all real backend videos. If backend is empty, show empty state.
          const hasApiVideos = Array.isArray(apiVideos) && apiVideos.length > 0;
          const sourceVideos = hasApiVideos ? apiVideos! : [];

          const mappedVideos: Video[] = sourceVideos.map(toClientVideo);

          /* For You = /api/feed/foryou (all public videos). Do not merge friends-only here. */
          set({
            videos: mappedVideos,
            mutualFollowIds: mutualFromApi,
            loading: false,
          });
        } catch (err) {
          set({ loading: false });
          if (!navigator.onLine) showToast('No internet connection');
          else showToast('Failed to load feed. Pull down to retry.');
        }
        };
        _feedFetchPromise = doFetch().finally(() => { _feedFetchPromise = null; });
        return _feedFetchPromise;
      },

      fetchStemVideos: async () => {
        set({ stemLoading: true });
        try {
          const { likedVideos, savedVideos, followingUsers } = get();
          const likedSet = new Set(likedVideos);
          const savedSet = new Set(savedVideos);
          const followingSet = new Set(followingUsers);

          const { data: body, error } = await request('/api/videos');
          if (error) {
            set({ stemVideos: [], stemLoading: false });
            return;
          }
          const rawList = Array.isArray(body?.videos) ? body.videos : [];
          const eligible = rawList.filter((v: any) => {
            if (v.privacy === 'private') return false;
            return !!(v.url || '').toString().trim();
          });
          const mapped = eligible.map((v: any) =>
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
          const { data: followBody } = await request(`/api/profiles/${authUser.id}/following`);
          if (followBody) {
            const ids: string[] = Array.isArray(followBody?.following) ? followBody.following : [];
            set({ followingUsers: ids });
          }

          /* Server unions following ∪ followers; do not skip when following list is empty */
          const { followingUsers } = get();

          const { data: body, error } = await request('/api/feed/friends');
          if (error) {
            set({ friendsLoading: false });
            return;
          }
          const apiVideos = Array.isArray(body?.videos) ? body.videos : [];
          if (apiVideos.length === 0) {
            set({ friendVideos: [], friendsLoading: false });
            return;
          }

          const { likedVideos, savedVideos } = get();
          const likedSet = new Set(likedVideos);
          const savedSet = new Set(savedVideos);
          const followingSet = new Set(followingUsers);

          const mappedVideos: Video[] = apiVideos.map((v: any) => {
            const u = v.user || {};
            const id = String(v.id || '');
            return {
              id,
              url: v.url || '',
              thumbnail: v.thumbnail || getVideoPosterUrl(v.url || ''),
              duration: v.duration || '0:15',
              user: {
                id: u.id || v.user_id || 'unknown',
                username: u.username || 'creator',
                name: u.name || u.username || 'Creator',
                avatar: u.avatar || '',
                level: u.level || 1,
                isVerified: !!u.isVerified,
                followers: u.followers ?? 0,
                following: u.following ?? 0,
                isFollowing: followingSet.has(String(u.id || '')),
              },
              description: v.description || '',
              hashtags: Array.isArray(v.hashtags) ? v.hashtags : [],
              music: v.music || { id: 'original', title: 'Original Sound', artist: u.name || 'Creator', duration: '0:15' },
              stats: v.stats || { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 },
              createdAt: v.createdAt || new Date().toISOString(),
              location: v.location,
              isLiked: likedSet.has(id) || !!v.isLiked,
              isSaved: savedSet.has(id) || !!v.isSaved,
              isFollowing: followingSet.has(String(u.id || '')) || !!v.isFollowing,
              comments: [],
              quality: 'auto',
              privacy: v.privacy || 'public',
              duetWithVideoId: v.duetWithVideoId,
            };
          });
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

          const { error } = await request(`/api/videos/${videoId}`, {
            method: 'DELETE',
          });

          if (error) {
            throw new Error(error.message || 'Failed to delete video');
          }

          set({ videos: get().videos.filter((v) => v.id !== videoId), friendVideos: get().friendVideos.filter((v) => v.id !== videoId) });
        } catch (err) {
          set({ videos: snapshot.videos, friendVideos: snapshot.friendVideos });
          throw err instanceof Error ? err : new Error('Failed to delete video.');
        }
      },

      // Like actions (persist to server + update video engagement / FYP eligibility)
      toggleLike: async (videoId) => {
        const state = get();
        const video = state.getVideoById(videoId);
        if (!video) return;

        const wasLiked = video.isLiked;
        const newLikes = Math.max(0, wasLiked ? video.stats.likes - 1 : video.stats.likes + 1);
        const updatedStats = { ...video.stats, likes: newLikes };

        const newLikedVideos = wasLiked
          ? state.likedVideos.filter(id => id !== videoId)
          : [...state.likedVideos, videoId];

        const likeUpdate = (v: Video) => v.id === videoId ? { ...v, isLiked: !wasLiked, stats: updatedStats } : v;
        set({
          videos: state.videos.map(likeUpdate),
          friendVideos: state.friendVideos.map(likeUpdate),
          likedVideos: newLikedVideos
        });

        try {
          const authUser = useAuthStore.getState().user;
          if (!authUser?.id) return;

          const { error } = await request(wasLiked ? `/api/videos/${videoId}/unlike` : `/api/videos/${videoId}/like`, { method: 'POST' });
          if (error) throw new Error('Like failed');

          if (!wasLiked) trackLike(videoId).catch(() => {});
          await refreshVideoFypStatus(videoId, updatedStats);
        } catch (err) {
          set({ videos: state.videos, friendVideos: state.friendVideos, likedVideos: state.likedVideos });
        }
      },

      getLikedVideos: () => {
        const { videos, likedVideos } = get();
        return videos.filter(video => likedVideos.includes(video.id));
      },

      // Save actions — persist to server
      toggleSave: async (videoId) => {
        const state = get();
        const video = state.getVideoById(videoId);
        if (!video) return;

        const wasSaved = video.isSaved;
        const newSavedVideos = wasSaved
          ? state.savedVideos.filter(id => id !== videoId)
          : [...state.savedVideos, videoId];

        const newSaves = Math.max(0, wasSaved ? (video.stats.saves || 0) - 1 : (video.stats.saves || 0) + 1);
        const saveUpdate = (v: Video) => v.id === videoId
          ? { ...v, isSaved: !wasSaved, stats: { ...v.stats, saves: newSaves } }
          : v;
        set({
          videos: state.videos.map(saveUpdate),
          friendVideos: state.friendVideos.map(saveUpdate),
          savedVideos: newSavedVideos,
        });

        try {
          const authUser = useAuthStore.getState().user;
          if (!authUser?.id) return;

          const { error: saveError } = await request(wasSaved ? `/api/videos/${videoId}/unsave` : `/api/videos/${videoId}/save`, { method: 'POST' });
          if (saveError) throw new Error('Save failed');
        } catch {
          const s = get();
          const revertSaves = Math.max(0, wasSaved ? (video.stats.saves || 0) + 1 : (video.stats.saves || 0) - 1);
          const revert = (v: Video) => v.id === videoId
            ? { ...v, isSaved: wasSaved, stats: { ...v.stats, saves: revertSaves } }
            : v;
          set({
            videos: s.videos.map(revert),
            friendVideos: s.friendVideos.map(revert),
            savedVideos: wasSaved ? [...s.savedVideos, videoId] : s.savedVideos.filter(id => id !== videoId),
          });
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
              ? { ...video, isFollowing: wasFollowing, user: { ...video.user, followers: video.user.followers } }
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
          const { error: followError } = await request(wasFollowing ? `/api/profiles/${userId}/unfollow` : `/api/profiles/${userId}/follow`, { method: 'POST' });
          if (followError) throw new Error('Follow request failed');
          if (!wasFollowing) trackFollow(userId).catch(() => {});
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

        const newShares = video.stats.shares + 1;
        const updatedStats = { ...video.stats, shares: newShares };
        const shareUpdate = (v: Video) => v.id === videoId ? { ...v, stats: updatedStats } : v;
        set({
          videos: state.videos.map(shareUpdate),
          friendVideos: state.friendVideos.map(shareUpdate),
        });

        try {
          trackShare(videoId).catch(() => {});
          await refreshVideoFypStatus(videoId, updatedStats);
        } catch (err) {
          /* ignored */
        }
      },

      // Comment actions – persist to server, refresh FYP eligibility
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
          const { data: body, error: commentError } = await request(`/api/videos/${videoId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ text: commentData.text, parentId: (commentData as any).parentId || null }),
          });

          if (commentError) throw new Error('Comment failed');

          if (body?.comment?.id) {
            const realId = body.comment.id;
            const commentIdUpdate = (v: Video) => v.id === videoId
              ? { ...v, comments: v.comments.map(c => c.id === tempId ? { ...c, id: realId } : c) }
              : v;
            set(s => ({
              videos: s.videos.map(commentIdUpdate),
              friendVideos: s.friendVideos.map(commentIdUpdate),
            }));
          }

          trackComment(videoId, commentData.text).catch(() => {});
          await refreshVideoFypStatus(videoId, updatedStats);
        } catch (err) {
          /* revert optimistic update on failure */
          set(s => ({
            videos: s.videos.map(v => v.id === videoId
              ? { ...v, comments: v.comments.filter(c => c.id !== tempId), stats: { ...v.stats, comments: Math.max(0, v.stats.comments - 1) } }
              : v),
            friendVideos: s.friendVideos.map(v => v.id === videoId
              ? { ...v, comments: v.comments.filter(c => c.id !== tempId), stats: { ...v.stats, comments: Math.max(0, v.stats.comments - 1) } }
              : v),
          }));
        }
      },

      deleteComment: async (videoId, commentId) => {
        const commentDelUpdate = (video: Video) => video.id === videoId
          ? {
              ...video,
              comments: video.comments.filter(c => c.id !== commentId),
              stats: { ...video.stats, comments: Math.max(0, video.stats.comments - 1) }
            }
          : video;
        set((state) => ({
          videos: state.videos.map(commentDelUpdate),
          friendVideos: state.friendVideos.map(commentDelUpdate),
        }));
        try {
          await request(`/api/videos/${videoId}/comments/${commentId}`, { method: 'DELETE' });
        } catch {
          /* ignored */
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

        // Comment likes are UI-only for now (no dedicated server endpoint)
      },

      // Analytics
      incrementViews: async (videoId) => {
        const state = get();
        const video = state.getVideoById(videoId);
        if (!video) return;

        const newViews = video.stats.views + 1;
        const updatedStats = { ...video.stats, views: newViews };
        const viewsUpdate = (v: Video) => v.id === videoId ? { ...v, stats: updatedStats } : v;
        set({
          videos: state.videos.map(viewsUpdate),
          friendVideos: state.friendVideos.map(viewsUpdate),
        });

        try {
          await request('/api/feed/track-view', { method: 'POST', body: JSON.stringify({ videoId }) }).catch(() => {});
          await refreshVideoFypStatus(videoId, updatedStats);
        } catch (err) {
          /* ignored */
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

      getRecommendedVideos: () => {
        const { videos, likedVideos, followingUsers: _followingUsers } = get();
        // Simple recommendation: show recent videos not seen/liked yet
        return videos
          .filter(video => !likedVideos.includes(video.id))
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
