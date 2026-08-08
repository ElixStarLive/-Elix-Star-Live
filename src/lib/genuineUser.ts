/**
 * Real human accounts only — blocks seeded / LiveKit / QA / proxy junk
 * shown in Share, Inbox, suggestions, etc.
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
  'name',
  'username',
  'proxy',
  'unique',
  'qaban',
  'qandroi',
  'qandroid',
  // Seeded demo brand shells (not real people)
  'elix star',
  'elixstar',
  'elix star live',
  'elixstarlive',
  'demo user',
  'demouser',
]);

/**
 * Seeded / ephemeral / device-QA handles:
 * lt_*, user_180, proxy*, unique*, explore*, qaban*, qandroi*, …
 */
const JUNK_HANDLE =
  /^(lt|live|guest|viewer|test|tests|testing|user|demo|sample|fake|unique|explore|explorer|exploring|elixstar|elix_test|qa|bot|proxy|name|qaban|qandroi|qandroid)([_\s-]|$)/i;

const JUNK_PHRASE =
  /\b(test\s*user|demo\s*user|john\s*doe|jane\s*doe|dummy|placeholder|fake\s*user|proxy\s*user)\b/i;

/** user_180 / user 180 / user180 / user-42 */
const USER_PLUS_DIGITS = /^user[\s_-]*\d+/i;

/** unique / unique_ / uniqueuser… */
const UNIQUE_JUNK = /^unique([\s_-]|$)/i;

/** proxy / proxy_ / proxyuser… */
const PROXY_JUNK = /^proxy([\s_-]|$)/i;

/** qaban / qandroi / qandroid device-QA shells */
const QA_DEVICE_JUNK = /^(qaban|qandroi|qandroid)([\s_-]|$)/i;

function looksLikeJunkLabel(part: string): boolean {
  if (!part) return true;
  if (JUNK_EXACT.has(part)) return true;
  if (JUNK_HANDLE.test(part)) return true;
  if (JUNK_PHRASE.test(part)) return true;
  if (USER_PLUS_DIGITS.test(part)) return true;
  if (UNIQUE_JUNK.test(part)) return true;
  if (PROXY_JUNK.test(part)) return true;
  if (QA_DEVICE_JUNK.test(part)) return true;
  if (/^user[_-]/.test(part)) return true;
  if (/^testuser/.test(part)) return true;
  if (/^explore/.test(part)) return true;
  if (/^name[\s_-]/.test(part)) return true;
  // UUID / hex dump used as a display name
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(part)) return true;
  if (/^[0-9a-f]{16,}$/.test(part)) return true;
  return false;
}

export function isGenuineAppUser(username: string, userId = '', displayName = ''): boolean {
  const id = String(userId || '').trim();
  if (!id) return false;

  const handle = String(username || '').trim().toLowerCase();
  const display = String(displayName || '').trim().toLowerCase();
  const label = handle || display;
  if (label.length < 2) return false;

  for (const part of [handle, display, label]) {
    if (!part) continue;
    if (looksLikeJunkLabel(part)) return false;
  }

  return true;
}
