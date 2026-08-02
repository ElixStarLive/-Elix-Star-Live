import { request } from '../../../lib/apiClient';

export async function apiLiveEngagementMissions(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/missions');
  return { data, error: error?.message ?? null };
}

export async function apiLiveEngagementProgress(
  payload: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const { error } = await request('/api/engagement/progress', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { error: error?.message ?? null };
}

export async function apiLiveProgressionMe(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/progression/me');
  return { data, error: error?.message ?? null };
}

export async function apiLiveEngagementWallet(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/wallet');
  return { data, error: error?.message ?? null };
}

export async function apiLiveRankingsWeekly(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/rankings/weekly');
  return { data, error: error?.message ?? null };
}

export async function apiLiveRankingsDaily(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/rankings/daily');
  return { data, error: error?.message ?? null };
}

export async function apiLiveShareCreate(payload: Record<string, unknown>): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/live-share', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { data, error: error?.message ?? null };
}

export async function apiLiveModerationCheck(payload: Record<string, unknown>): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/live/moderation/check', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { data, error: error?.message ?? null };
}

export async function apiEngagementHub(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/hub');
  return { data, error: error?.message ?? null };
}

export async function apiEngagementFanLevel(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/fan-level');
  return { data, error: error?.message ?? null };
}

export async function apiEngagementMvp(period: 'today' | 'week' | 'all'): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/engagement/mvp?period=${encodeURIComponent(period)}`,
  );
  return { data, error: error?.message ?? null };
}

export async function apiEngagementAchievements(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/achievements');
  return { data, error: error?.message ?? null };
}

export async function apiEngagementDailyLogin(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/daily-login');
  return { data, error: error?.message ?? null };
}

export async function apiEngagementDailyLoginClaim(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/daily-login/claim', {
    method: 'POST',
  });
  return { data, error: error?.message ?? null };
}

export async function apiEngagementMissions(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/missions');
  return { data, error: error?.message ?? null };
}

export async function apiEngagementMissionClaim(missionId: string): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const { error } = await request(`/api/engagement/missions/${encodeURIComponent(missionId)}/claim`, {
    method: 'POST',
  });
  return { ok: !error, error: error?.message ?? null };
}

export async function apiEngagementTreasure(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/treasure');
  return { data, error: error?.message ?? null };
}

export async function apiEngagementTreasureOpen(chestId: string): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/engagement/treasure/${encodeURIComponent(chestId)}/open`,
    { method: 'POST' },
  );
  return { data, error: error?.message ?? null };
}

export async function apiEngagementStickers(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/stickers');
  return { data, error: error?.message ?? null };
}

export async function apiEngagementCreatorCards(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/creator-cards');
  return { data, error: error?.message ?? null };
}

export async function apiEngagementCreatorCardsByCreator(creatorId?: string): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const q = creatorId ? `?creatorId=${encodeURIComponent(creatorId)}` : '';
  const { data, error } = await request<Record<string, unknown>>(`/api/engagement/creator-cards${q}`);
  return { data, error: error?.message ?? null };
}

export async function apiEngagementBattleEnergyFan(roomId: string): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/engagement/battle-energy/fan?roomId=${encodeURIComponent(roomId)}`,
  );
  return { data, error: error?.message ?? null };
}

export async function apiEngagementBattleEnergyBoost(payload: {
  roomId: string;
  side: 'host' | 'opponent';
  amount: number;
}): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/engagement/battle-energy/boost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { data, error: error?.message ?? null };
}

export async function apiEngagementBattleEnergyEarn(payload: {
  source: 'watch' | 'comment' | 'share';
  roomId?: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request('/api/engagement/battle-energy/earn', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { ok: !error, error: error?.message ?? null };
}

export async function apiLiveSendDailyHeart(creatorId: string): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/hearts/daily', {
    method: 'POST',
    body: JSON.stringify({ creatorId }),
  });
  return { data, error: error?.message ?? null };
}

export async function apiLiveGetDailyHearts(hostUserId: string): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/hearts/daily/${encodeURIComponent(hostUserId)}`,
  );
  return { data, error: error?.message ?? null };
}

export async function apiLiveMembership(userId: string): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/membership/${encodeURIComponent(userId)}`,
  );
  return { data, error: error?.message ?? null };
}

export async function apiLiveStickers(userId: string): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/stickers/${encodeURIComponent(userId)}`,
  );
  return { data, error: error?.message ?? null };
}

export async function apiLiveStickerDelete(id: number): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const { error } = await request(`/api/stickers/${id}`, { method: 'DELETE' });
  return { ok: !error, error: error?.message ?? null };
}

export async function apiLiveBlockUser(blockedId: string): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const { error } = await request('/api/block-user', {
    method: 'POST',
    body: JSON.stringify({ blockedId }),
  });
  return { ok: !error, error: error?.message ?? null };
}
