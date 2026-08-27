/**
 * Per-account login throttling.
 *
 * An IP-based limit bounds one attacker on one address but does nothing against
 * a spread-out run at a single account: with enough addresses, every guess
 * arrives on a fresh budget. These counters key on the account being attacked,
 * so guesses accumulate wherever they come from.
 *
 * The counter lives in Valkey rather than process memory because a per-instance
 * counter hands each instance its own full budget. When Valkey cannot answer the
 * gate fails closed — refusing a sign-in during an outage is recoverable;
 * silently disabling the brake on the credential-stuffing path is not.
 *
 * The identifier is hashed so no email address is written into a cache key.
 */

import crypto from 'node:crypto';
import { valkeyDel, valkeyGet, valkeyIncrWithTtl } from '../lib/valkey.js';
import { logger } from '../lib/logger.js';

const MAX_FAILURES = 10;
const WINDOW_SECONDS = 15 * 60;

function key(identifier: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(identifier.trim().toLowerCase())
    .digest('hex');
  return `auth:login-fail:${digest}`;
}

export async function isLockedOut(identifier: string): Promise<boolean> {
  const read = await valkeyGet(key(identifier));
  if (read.status === 'unavailable') {
    logger.error('login lockout counter unreadable — refusing the attempt');
    return true;
  }
  return (Number(read.value) || 0) >= MAX_FAILURES;
}

/** Each failure restarts the window: ten wrong answers inside any fifteen minutes hold the account for the next fifteen. */
export async function recordFailure(identifier: string): Promise<void> {
  const result = await valkeyIncrWithTtl(key(identifier), WINDOW_SECONDS);
  if (result.status === 'unavailable') {
    logger.error('login failure not recorded — lockout counter unavailable');
  }
}

export async function clearFailures(identifier: string): Promise<void> {
  await valkeyDel(key(identifier));
}
