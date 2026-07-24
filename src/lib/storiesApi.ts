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
  const stories = Array.isArray(data?.stories) ? data.stories : [];
  // #region agent log
  fetch('http://127.0.0.1:7293/ingest/e7fb8ad3-ac4d-422a-955a-8c318a5cd9e2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fa77db'},body:JSON.stringify({sessionId:'fa77db',runId:'stories-api',hypothesisId:'H3',location:'storiesApi.ts:fetchActiveStories',message:'GET /api/stories result',data:{ok:!error,err:error?.message||null,groupCount:stories.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (error) return [];
  return stories;
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
