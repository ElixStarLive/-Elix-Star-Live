import { request } from './apiClient';

export type StoryItem = {
  id: string;
  mediaUrl: string;
  thumbnail?: string;
  mediaType: string;
  createdAt: string;
  expiresAt: string;
};

export type StoryUserGroup = {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  items: StoryItem[];
};

export async function fetchActiveStories(): Promise<StoryUserGroup[]> {
  const { data, error } = await request<{ stories?: StoryUserGroup[] }>('/api/stories');
  if (error) return [];
  return Array.isArray(data?.stories) ? data.stories : [];
}

export async function createStoryRecord(payload: {
  id: string;
  url: string;
  thumbnailUrl?: string;
  mediaType?: 'video' | 'image';
}): Promise<{ id: string }> {
  const { data, error } = await request<{ id?: string; error?: string }>('/api/stories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (error) {
    throw new Error(error.message || 'Failed to create story');
  }
  if (!data?.id) {
    throw new Error('Story saved but server returned no id');
  }
  return { id: data.id };
}
