/**
 * Create/ensure /api/profiles row after signup (POST + one retry).
 */

import { request } from './apiClient';

export type EnsureUserProfileRowInput = {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
};

export async function ensureUserProfileRow(
  input: EnsureUserProfileRowInput,
): Promise<{ error: string | null }> {
  const body = JSON.stringify({
    userId: input.userId,
    username: input.username,
    displayName: input.displayName,
    email: input.email,
    avatarUrl: input.avatarUrl,
  });
  const { error: profileError } = await request('/api/profiles', {
    method: 'POST',
    body,
  });
  if (!profileError) return { error: null };

  const retry = await request('/api/profiles', {
    method: 'POST',
    body,
  });
  if (retry.error) {
    return {
      error:
        retry.error.message ||
        'Account created but profile setup failed. Please sign in again.',
    };
  }
  return { error: null };
}
