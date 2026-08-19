import { api, request } from '../../lib/apiClient';

interface AdminDashboardSourceData {
  totalUsers: number;
  totalVideos: number;
  liveRooms: number;
  pendingReports: number;
  totalRevenueMinor: number;
  dailyActiveUsers: number;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

export async function apiFetchAdminDashboardSourceData(): Promise<{
  data: AdminDashboardSourceData;
  error: string | null;
}> {
  const results = await Promise.allSettled([
    api.profiles.list(),
    api.videos.list(),
    request('/api/live/streams'),
    request('/api/admin/reports'),
    request('/api/admin/purchases'),
    request('/api/admin/stats/dau'),
  ]);
  const settled = (i: number): { count?: number; data?: Record<string, unknown> | unknown[] | null } =>
    results[i].status === 'fulfilled'
      ? (results[i] as PromiseFulfilledResult<{ count?: number; data?: Record<string, unknown> | unknown[] | null }>).value
      : { data: null };
  const [usersRes, videosRes, liveRes, reportsRes, purchasesRes, dauRes] = [
    settled(0),
    settled(1),
    settled(2),
    settled(3),
    settled(4),
    settled(5),
  ];

  const totalUsers = usersRes.count ?? asArray(usersRes.data).length;
  const totalVideos = asArray(videosRes.data).length;
  const liveStreamsBody = (liveRes.data as Record<string, unknown> | null)?.streams ?? liveRes.data;
  const liveRooms = asArray(liveStreamsBody).length;
  const reportsBody = reportsRes.data as Record<string, unknown> | unknown[] | null;
  const reports = asArray(reportsBody) .length > 0
    ? asArray(reportsBody)
    : asArray((reportsBody as Record<string, unknown> | null)?.data);
  const pendingReports = reports.filter((row) => row.status === 'pending').length;
  const purchasesBody = purchasesRes.data as Record<string, unknown> | unknown[] | null;
  const purchases = asArray(purchasesBody).length > 0
    ? asArray(purchasesBody)
    : asArray((purchasesBody as Record<string, unknown> | null)?.data);
  const totalRevenueMinor = purchases.reduce((sum, row) => sum + Number(row.price_minor ?? 0), 0);
  const dailyActiveUsers = Number((dauRes.data as Record<string, unknown> | null)?.dau ?? 0);

  return {
    data: {
      totalUsers,
      totalVideos,
      liveRooms,
      pendingReports,
      totalRevenueMinor,
      dailyActiveUsers: Number.isFinite(dailyActiveUsers) ? dailyActiveUsers : 0,
    },
    error: null,
  };
}

interface AdminEconomySourceData {
  gifts: Record<string, unknown>[];
  boosters: Record<string, unknown>[];
  packages: Record<string, unknown>[];
}

export async function apiFetchAdminEconomySourceData(): Promise<{
  data: AdminEconomySourceData;
  error: string | null;
}> {
  try {
    const [giftsRes, boostersRes, packagesRes] = await Promise.all([
      api.gifts.getCatalog(),
      request('/api/boosters/catalog'),
      request('/api/coin-packages'),
    ]);
    const gData = giftsRes.data as Record<string, unknown> | unknown[] | null;
    const gifts = asArray(gData).length > 0
      ? asArray(gData)
      : asArray((gData as Record<string, unknown> | null)?.gifts ?? (gData as Record<string, unknown> | null)?.data);
    const bData = boostersRes.data as Record<string, unknown> | unknown[] | null;
    const boosters = asArray(bData).length > 0 ? asArray(bData) : asArray((bData as Record<string, unknown> | null)?.data);
    const pData = packagesRes.data as Record<string, unknown> | unknown[] | null;
    const packages = asArray(pData).length > 0
      ? asArray(pData)
      : asArray((pData as Record<string, unknown> | null)?.packages ?? (pData as Record<string, unknown> | null)?.data);
    return { data: { gifts, boosters, packages }, error: null };
  } catch (e: unknown) {
    return {
      data: { gifts: [], boosters: [], packages: [] },
      error: e instanceof Error ? e.message : 'Failed to load economy data',
    };
  }
}

export async function apiAdminUpdateGiftPrice(
  giftId: string,
  newPrice: number,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(`/api/admin/gifts/catalog/${encodeURIComponent(giftId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ coin_cost: newPrice }),
  });
  if (error) return { ok: false, error: error.message || 'Failed to update gift price' };
  return { ok: true, error: null };
}

export async function apiAdminListUsers(): Promise<{
  users: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<{ users?: unknown[] }>('/api/admin/users');
  if (error) return { users: [], error: error.message || 'Failed to load users' };
  return { users: Array.isArray(data?.users) ? (data.users as Record<string, unknown>[]) : [], error: null };
}

export async function apiAdminSetUserBan(
  userId: string,
  banned: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(`/api/admin/users/${encodeURIComponent(userId)}/ban`, {
    method: banned ? 'POST' : 'DELETE',
    body: banned ? JSON.stringify({ reason: 'Banned by admin' }) : undefined,
  });
  if (error) return { ok: false, error: error.message || 'Failed to update user status' };
  return { ok: true, error: null };
}

export async function apiAdminListReports(status?: 'pending' | 'all'): Promise<{
  reports: Record<string, unknown>[];
  error: string | null;
}> {
  const queryParam = status === 'pending' ? '?status=pending' : '';
  const { data, error } = await request<Record<string, unknown> | unknown[]>(`/api/admin/reports${queryParam}`);
  if (error) return { reports: [], error: error.message || 'Failed to load reports' };
  const list = Array.isArray(data)
    ? data
    : (Array.isArray((data as { data?: unknown[] } | null)?.data) ? (data as { data: unknown[] }).data : []);
  return { reports: list as Record<string, unknown>[], error: null };
}

export async function apiAdminResolveReport(
  reportId: string,
  outcome: 'removed' | 'warned' | 'no_action',
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(`/api/admin/reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'actioned',
      action: outcome,
      admin_note: `Outcome: ${outcome}`,
    }),
  });
  if (error) return { ok: false, error: error.message || 'Failed to resolve report' };
  return { ok: true, error: null };
}

export async function apiAdminListPayouts(status: string): Promise<{
  payouts: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<{ payouts?: unknown[] }>(
    `/api/admin/payouts?status=${encodeURIComponent(status)}`,
  );
  if (error) return { payouts: [], error: error.message || 'Failed to load payouts' };
  return { payouts: Array.isArray(data?.payouts) ? (data.payouts as Record<string, unknown>[]) : [], error: null };
}

export async function apiAdminPayoutAction(
  id: string,
  action: 'review' | 'approve' | 'reject' | 'mark-paid' | 'cancel',
  adminNote?: string,
): Promise<{ ok: boolean; error: string | null }> {
  const note = adminNote?.trim();
  const { error } = await request(`/api/admin/payout/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ admin_note: note || undefined }),
  });
  if (error) return { ok: false, error: error.message || 'Action failed' };
  return { ok: true, error: null };
}

export async function apiAdminProgressionLoadEngagementAdmin(): Promise<{
  flags: Record<string, boolean> | null;
  rows: unknown[];
  missions: unknown[];
  rewards: unknown[];
  policy: Record<string, unknown> | null;
  caps: Record<string, unknown> | null;
  entries: unknown[];
}> {
  const [flagsRes, missionsRes, dailyRes, capsRes, auditRes] = await Promise.all([
    request('/api/admin/progression/feature-flags'),
    request('/api/admin/progression/missions'),
    request('/api/admin/progression/daily-rewards'),
    request('/api/admin/progression/battle-energy-caps'),
    request('/api/admin/progression/audit-history?limit=30'),
  ]);
  return {
    flags: (flagsRes.data?.flags as Record<string, boolean>) ?? null,
    rows: Array.isArray(flagsRes.data?.rows) ? (flagsRes.data?.rows as unknown[]) : [],
    missions: Array.isArray(missionsRes.data?.missions) ? (missionsRes.data?.missions as unknown[]) : [],
    rewards: Array.isArray(dailyRes.data?.rewards) ? (dailyRes.data?.rewards as unknown[]) : [],
    policy: (dailyRes.data?.policy as Record<string, unknown>) ?? null,
    caps: (capsRes.data?.caps as Record<string, unknown>) ?? null,
    entries: Array.isArray(auditRes.data?.entries) ? (auditRes.data?.entries as unknown[]) : [],
  };
}

export async function apiAdminProgressionLoadConfig(): Promise<{
  config: unknown[];
  levels: unknown[];
  error: string | null;
}> {
  const [configRes, levelsRes] = await Promise.all([
    request('/api/admin/progression/config'),
    request('/api/admin/progression/levels'),
  ]);
  const error =
    configRes.error?.message ??
    levelsRes.error?.message ??
    null;
  return {
    config: Array.isArray(configRes.data?.config) ? (configRes.data?.config as unknown[]) : [],
    levels: Array.isArray(levelsRes.data?.levels) ? (levelsRes.data?.levels as unknown[]) : [],
    error,
  };
}

/**
 * Request payloads below are typed `object` rather than `Record<string, unknown>`
 * because they are only serialised as the JSON body. Requiring an index signature
 * meant every caller had to double-cast its own typed row to get it through.
 */
export async function apiAdminProgressionSaveConfig(row: object): Promise<{ error: string | null }> {
  const { error } = await request('/api/admin/progression/config', {
    method: 'PATCH',
    body: JSON.stringify(row),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionSaveLevel(row: object): Promise<{ error: string | null }> {
  const { error } = await request('/api/admin/progression/levels', {
    method: 'PUT',
    body: JSON.stringify(row),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionLoadUser(userId: string): Promise<{
  progression: Record<string, unknown> | null;
  xp_history: unknown[];
  starter_history: unknown[];
  error: string | null;
}> {
  const { data, error } = await request(
    `/api/admin/progression/users/${encodeURIComponent(userId)}`,
  );
  return {
    progression: (data?.progression as Record<string, unknown>) ?? null,
    xp_history: Array.isArray(data?.xp_history) ? (data?.xp_history as unknown[]) : [],
    starter_history: Array.isArray(data?.starter_history) ? (data?.starter_history as unknown[]) : [],
    error: error?.message ?? null,
  };
}

export async function apiAdminProgressionAdjust(
  endpoint: 'xp-adjustments' | 'starter-adjustments',
  payload: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const { error } = await request(
    `/api/admin/progression/${endpoint}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionToggleFeatureFlag(payload: Record<string, unknown>): Promise<{
  flags: Record<string, boolean> | null;
  rows: unknown[];
  error: string | null;
}> {
  const { data, error } = await request('/api/admin/progression/feature-flags', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return {
    flags: (data?.flags as Record<string, boolean>) ?? null,
    rows: Array.isArray(data?.rows) ? (data?.rows as unknown[]) : [],
    error: error?.message ?? null,
  };
}

export async function apiAdminProgressionSaveMission(
  missionId: string,
  payload: object,
): Promise<{ error: string | null }> {
  const { error } = await request(
    `/api/admin/progression/missions/${encodeURIComponent(missionId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionArchiveMission(missionId: string): Promise<{ error: string | null }> {
  const { error } = await request(
    `/api/admin/progression/missions/${encodeURIComponent(missionId)}/archive`,
    { method: 'POST', body: '{}' },
  );
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionSaveDailyReward(payload: object): Promise<{ error: string | null }> {
  const { error } = await request('/api/admin/progression/daily-rewards', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionSaveDailyPolicy(payload: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await request('/api/admin/progression/daily-rewards/policy', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionSaveBattleEnergyCaps(payload: object): Promise<{
  caps: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request('/api/admin/progression/battle-energy-caps', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return {
    caps: (data?.caps as Record<string, unknown>) ?? null,
    error: error?.message ?? null,
  };
}

export async function apiAdminRisingStarsReload(): Promise<{
  seasons: unknown[];
  audit: unknown[];
  error: string | null;
}> {
  const [seasonsRes, auditRes] = await Promise.all([
    request('/api/admin/rising-stars/seasons'),
    request('/api/admin/rising-stars/audit?limit=50'),
  ]);
  return {
    seasons: Array.isArray(seasonsRes.data?.seasons) ? (seasonsRes.data?.seasons as unknown[]) : [],
    audit: Array.isArray(auditRes.data?.audit) ? (auditRes.data?.audit as unknown[]) : [],
    error: seasonsRes.error?.message ?? null,
  };
}

export async function apiAdminRisingStarsLoadChallenges(seasonId: string): Promise<{
  challenges: unknown[];
  error: string | null;
}> {
  const { data, error } = await request(
    `/api/rising-stars/challenges?seasonId=${seasonId}`,
  );
  return {
    challenges: Array.isArray(data?.challenges) ? (data?.challenges as unknown[]) : [],
    error: error?.message ?? null,
  };
}

export async function apiAdminRisingStarsCreateSeason(payload: object): Promise<{ error: string | null }> {
  const { error } = await request('/api/admin/rising-stars/seasons', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminRisingStarsCreateCategory(payload: Record<string, unknown>): Promise<{
  category: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request('/api/admin/rising-stars/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    category: (data?.category as Record<string, unknown>) ?? null,
    error: error?.message ?? null,
  };
}

export async function apiAdminRisingStarsCreateRegion(payload: Record<string, unknown>): Promise<{
  region: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request('/api/admin/rising-stars/regions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    region: (data?.region as Record<string, unknown>) ?? null,
    error: error?.message ?? null,
  };
}

export async function apiAdminRisingStarsCreateChallenge(payload: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await request('/api/admin/rising-stars/challenges', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminRisingStarsSetChallengeStatus(
  challengeId: string,
  payload: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const { error } = await request(
    `/api/admin/rising-stars/challenges/${challengeId}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
  return { error: error?.message ?? null };
}

export async function apiAdminRisingStarsSnapshot(
  challengeId: string,
  payload: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const { error } = await request(
    `/api/admin/rising-stars/challenges/${challengeId}/snapshot`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return { error: error?.message ?? null };
}
