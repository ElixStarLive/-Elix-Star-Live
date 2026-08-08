/**
 * Real human accounts only — blocks seeded / LiveKit / QA junk shown in Share, Inbox, etc.
 */

const JUNK_EXACT = new Set([
  '',
  'user',
  'demo',
  'test',
  'testuser',
  'unknown',
  'anonymous',
  'guest',
  'viewer',
  'live',
  'explore',
  'explorer',
  'exploring',
  'johndoe',
  'john doe',
  'jane doe',
  'janedoe',
  'sample',
  'fake',
  'placeholder',
  'admin',
  'null',
  'undefined',
  // Seeded demo brand shells (not real people)
  'elix star',
  'elixstar',
  'elix star live',
  'elixstarlive',
  'demo user',
  'demouser',
]);

/** Seeded / ephemeral handle patterns (lt_*, explore*, unique_*, test*, …). */
const JUNK_HANDLE =
  /^(lt|live|guest|viewer|test|tests|testing|user|demo|sample|fake|unique|explore|explorer|exploring|elixstar|elix_test|qa|bot)([_-]|$)/i;

const JUNK_PHRASE =
  /\b(test\s*user|demo\s*user|john\s*doe|jane\s*doe|dummy|placeholder|fake\s*user)\b/i;

export function isGenuineAppUser(username: string, userId = '', displayName = ''): boolean {
  const id = String(userId || '').trim();
  if (!id) return false;

  const handle = String(username || '').trim().toLowerCase();
  const display = String(displayName || '').trim().toLowerCase();
  const label = handle || display;
  if (label.length < 2) return false;

  for (const part of [handle, display, label]) {
    if (!part) continue;
    if (JUNK_EXACT.has(part)) return false;
    if (JUNK_HANDLE.test(part)) return false;
    if (JUNK_PHRASE.test(part)) return false;
    if (/^user[_-]/.test(part)) return false;
    if (/^testuser/.test(part)) return false;
    if (/^unique[_-]/.test(part)) return false;
    if (/^explore/.test(part)) return false;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(part)) return false;
    if (/^[0-9a-f]{16,}$/.test(part)) return false;
  }

  return true;
}
