import { request, type ApiResult } from '../../lib/apiClient';

export interface FeedVideo {
  id: string;
  url: string;
  thumbnail: string;
  duration: number;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string;
  };
  description: string;
  hashtags: string[];
  stats: {
    views: number;
    likes: number;
    comments: number;
  };
  createdAt: string;
  likedByMe: boolean;
  savedByMe: boolean;
}

export async function fetchForYou(): Promise<ApiResult<{ videos: FeedVideo[]; hasMore: boolean }>> {
  return request<{ videos: FeedVideo[]; hasMore: boolean }>('/api/feed');
}

export async function fetchSTEM(): Promise<ApiResult<{ videos: FeedVideo[]; hasMore: boolean }>> {
  return request<{ videos: FeedVideo[]; hasMore: boolean }>('/api/stem');
}

export async function fetchDiscover(): Promise<ApiResult<{ videos: FeedVideo[]; hasMore: boolean }>> {
  return request<{ videos: FeedVideo[]; hasMore: boolean }>('/api/discover');
}

export async function fetchHashtag(tag: string): Promise<ApiResult<{ tag: string; videos: FeedVideo[]; hasMore: boolean }>> {
  return request<{ tag: string; videos: FeedVideo[]; hasMore: boolean }>(`/api/hashtag/${encodeURIComponent(tag)}`);
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  hashtag: string;
  endAt: string;
  isActive: boolean;
}

export async function fetchChallenge(challengeId: string): Promise<ApiResult<{ challenge: Challenge; videos: FeedVideo[] }>> {
  return request<{ challenge: Challenge; videos: FeedVideo[] }>(`/api/challenges/${encodeURIComponent(challengeId)}`);
}

export async function fetchRisingStars(): Promise<ApiResult<{ videos: FeedVideo[]; hasMore: boolean }>> {
  return request<{ videos: FeedVideo[]; hasMore: boolean }>('/api/rising-stars');
}

export async function fetchFollowing(): Promise<ApiResult<{ videos: FeedVideo[]; hasMore: boolean }>> {
  return request<{ videos: FeedVideo[]; hasMore: boolean }>('/api/following');
}

export async function fetchFriends(): Promise<ApiResult<{ videos: FeedVideo[]; hasMore: boolean }>> {
  return request<{ videos: FeedVideo[]; hasMore: boolean }>('/api/friends');
}

export async function fetchVideo(videoId: string): Promise<ApiResult<{ video: FeedVideo }>> {
  return request<{ video: FeedVideo }>(`/api/videos/${encodeURIComponent(videoId)}`);
}

export async function createVideo(body: {
  url: string;
  thumbnail?: string;
  description?: string;
  hashtags?: string[];
  privacy?: 'public' | 'private' | 'friends';
}): Promise<ApiResult<{ id: string }>> {
  return request<{ id: string }>('/api/videos', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchSaved(): Promise<ApiResult<{ videos: FeedVideo[] }>> {
  return request<{ videos: FeedVideo[] }>('/api/saved');
}

export async function saveVideo(videoId: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/api/videos/${encodeURIComponent(videoId)}/save`, { method: 'POST' });
}

export async function unsaveVideo(videoId: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/api/videos/${encodeURIComponent(videoId)}/save`, { method: 'DELETE' });
}
