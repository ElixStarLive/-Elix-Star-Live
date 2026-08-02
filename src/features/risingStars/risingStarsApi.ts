import { request } from '../../lib/apiClient';

export async function apiRisingStarsCurrentSeason(): Promise<{
  season: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/rising-stars/seasons/current');
  if (error) return { season: null, error: error.message };
  return { season: (data?.season as Record<string, unknown>) ?? null, error: null };
}

export async function apiRisingStarsCategories(seasonId: string): Promise<{
  categories: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/rising-stars/categories?seasonId=${seasonId}`,
  );
  if (error) return { categories: [], error: error.message };
  return {
    categories: Array.isArray(data?.categories) ? (data.categories as Record<string, unknown>[]) : [],
    error: null,
  };
}

export async function apiRisingStarsRegions(seasonId: string): Promise<{
  regions: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/rising-stars/regions?seasonId=${seasonId}`,
  );
  if (error) return { regions: [], error: error.message };
  return {
    regions: Array.isArray(data?.regions) ? (data.regions as Record<string, unknown>[]) : [],
    error: null,
  };
}

export async function apiRisingStarsStandings(seasonId: string): Promise<{
  standings: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/rising-stars/seasons/${seasonId}/standings`,
  );
  if (error) return { standings: [], error: error.message };
  return {
    standings: Array.isArray(data?.standings) ? (data.standings as Record<string, unknown>[]) : [],
    error: null,
  };
}

export async function apiRisingStarsTeams(seasonId: string): Promise<{
  teams: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/rising-stars/teams?seasonId=${seasonId}`,
  );
  if (error) return { teams: [], error: error.message };
  return {
    teams: Array.isArray(data?.teams) ? (data.teams as Record<string, unknown>[]) : [],
    error: null,
  };
}

export async function apiRisingStarsChallenges(query: string): Promise<{
  challenges: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(`/api/rising-stars/challenges?${query}`);
  if (error) return { challenges: [], error: error.message };
  return {
    challenges: Array.isArray(data?.challenges) ? (data.challenges as Record<string, unknown>[]) : [],
    error: null,
  };
}

export async function apiRisingStarsChallenge(challengeId: string): Promise<{
  body: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/rising-stars/challenges/${challengeId}`,
  );
  if (error) return { body: null, error: error.message };
  return { body: data ?? null, error: null };
}

export async function apiRisingStarsChallengeEntries(challengeId: string): Promise<{
  entries: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/rising-stars/challenges/${challengeId}/entries`,
  );
  if (error) return { entries: [], error: error.message };
  return {
    entries: Array.isArray(data?.entries) ? (data.entries as Record<string, unknown>[]) : [],
    error: null,
  };
}

export async function apiRisingStarsEnterChallenge(
  challengeId: string,
  videoId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(`/api/rising-stars/challenges/${challengeId}/enter`, {
    method: 'POST',
    body: JSON.stringify({ videoId }),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function apiRisingStarsVoteEntry(entryId: string): Promise<{
  body: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/rising-stars/entries/${entryId}/vote`,
    { method: 'POST', body: '{}' },
  );
  if (error) return { body: null, error: error.message };
  return { body: data ?? null, error: null };
}

export async function apiRisingStarsUserBadges(userId: string): Promise<{
  badges: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/rising-stars/badges/user/${encodeURIComponent(userId)}`,
  );
  if (error) return { badges: [], error: error.message };
  return {
    badges: Array.isArray(data?.badges) ? (data.badges as Record<string, unknown>[]) : [],
    error: null,
  };
}
