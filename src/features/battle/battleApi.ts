import { request, type ApiResult } from '../../lib/apiClient';

export interface Battle {
  id: string;
  creatorStreamId: string;
  opponentStreamId: string;
  creatorScore: number;
  opponentScore: number;
  isActive: boolean;
  startedAt: string;
}

export async function startBattle(body: { creatorStreamId: string; opponentStreamId: string }): Promise<ApiResult<{ id: string }>> {
  return request<{ id: string }>('/api/battles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchBattle(battleId: string): Promise<ApiResult<Battle>> {
  return request<Battle>(`/api/battles/${encodeURIComponent(battleId)}`);
}

export async function tapBattle(battleId: string, side: 'creator' | 'opponent'): Promise<ApiResult<{ creatorScore: number; opponentScore: number; pointsAdded: number }>> {
  return request<{ creatorScore: number; opponentScore: number; pointsAdded: number }>(`/api/battles/${encodeURIComponent(battleId)}/tap`, {
    method: 'POST',
    body: JSON.stringify({ side }),
  });
}
