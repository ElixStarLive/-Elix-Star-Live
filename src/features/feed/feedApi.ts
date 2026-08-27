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

export async function fetchFollowing(): Promise<ApiResult<{ videos: FeedVideo[]; hasMore: boolean }>> {
  return request<{ videos: FeedVideo[]; hasMore: boolean }>('/api/following');
}

export async function fetchFriends(): Promise<ApiResult<{ videos: FeedVideo[]; hasMore: boolean }>> {
  return request<{ videos: FeedVideo[]; hasMore: boolean }>('/api/friends');
}
