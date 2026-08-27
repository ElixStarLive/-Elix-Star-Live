import { request, type ApiResult } from '../../lib/apiClient';

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
