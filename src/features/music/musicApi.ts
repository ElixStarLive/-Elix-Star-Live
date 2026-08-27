import { request, type ApiResult } from '../../lib/apiClient';
import type { FeedVideo } from '../feed/feedApi';

export interface Sound {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  useCount: number;
}

export async function fetchSounds(): Promise<ApiResult<{ sounds: Sound[] }>> {
  return request<{ sounds: Sound[] }>('/api/music');
}

export async function fetchSound(songId: string): Promise<ApiResult<{ sound: Sound; videos: FeedVideo[] }>> {
  return request<{ sound: Sound; videos: FeedVideo[] }>(`/api/music/${encodeURIComponent(songId)}`);
}
