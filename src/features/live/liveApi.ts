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

export async function inviteCoHost(streamId: string, cohostId: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/api/live/${encodeURIComponent(streamId)}/cohost`, {
    method: 'POST',
    body: JSON.stringify({ cohostId }),
  });
}

export async function fetchLiveStream(streamId: string): Promise<ApiResult<{ stream: LiveStream & { streamKey: string } }>> {
  return request<{ stream: LiveStream & { streamKey: string } }>(`/api/live/${encodeURIComponent(streamId)}`);
}

export async function fetchLiveToken(streamId: string): Promise<ApiResult<{ token: string; url: string }>> {
  return request<{ token: string; url: string }>(`/api/live/${encodeURIComponent(streamId)}/token`, { method: 'POST' });
}
