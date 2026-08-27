import { request, type ApiResult } from '../../lib/apiClient';

export interface LiveStream {
  id: string;
  userId: string;
  title: string;
  displayName: string;
  avatarUrl: string;
  viewerCount: number;
  startedAt: string;
}

export async function fetchLiveStreams(): Promise<ApiResult<{ streams: LiveStream[] }>> {
  return request<{ streams: LiveStream[] }>('/api/live');
}

export async function fetchLiveStream(streamId: string): Promise<ApiResult<{ stream: LiveStream & { streamKey: string } }>> {
  return request<{ stream: LiveStream & { streamKey: string } }>(`/api/live/${encodeURIComponent(streamId)}`);
}
