/**
 * Deriving a username when someone does not choose one.
 *
 * The result must satisfy the `users_username_format` constraint, so the same
 * rule is applied here rather than discovered as a database error at insert
 * time. Suggestion is deliberately separate from uniqueness: this module
 * produces candidates, the repository decides which one is free.
 */

import crypto from 'node:crypto';

const MIN_LENGTH = 3;
const MAX_LENGTH = 30;
const ALLOWED = /[^a-zA-Z0-9_.]/g;

/** Matches `users_username_format` in migration 001. */
export function isValidUsername(value: string): boolean {
  return /^[a-zA-Z0-9_.]{3,30}$/.test(value);
}

function sanitise(raw: string): string {
  const cleaned = raw.replace(ALLOWED, '').slice(0, MAX_LENGTH);
  // A local part like "a.b" can sanitise down to almost nothing, so short
  // results are padded rather than rejected — the person did not choose this
  // name and should not be shown an error about it.
  return cleaned.length >= MIN_LENGTH ? cleaned : `${cleaned}user`.slice(0, MAX_LENGTH);
}

/**
 * Candidate usernames derived from an email address, in preference order. The
 * first is the plain local part; the rest carry a random suffix so a taken name
 * does not reveal that the corresponding address is registered.
 */
export function usernameCandidates(email: string, attempts = 5): string[] {
  const base = sanitise(email.split('@')[0] ?? '');
  const candidates = [base];

  for (let i = 1; i < attempts; i += 1) {
    const suffix = crypto.randomInt(1000, 10_000).toString();
    const trimmed = base.slice(0, MAX_LENGTH - suffix.length - 1);
    candidates.push(`${trimmed}_${suffix}`);
  }

  return candidates.filter(isValidUsername);
}
