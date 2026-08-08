/**
 * Share / lists: drop ONLY the demo handles the owner named.
 * Real users stay. No broad junk wipe.
 *
 * Named: proxy, user 180, name, unique, qaban, qandroi,
 *        crd, sgtashy / sgtahy / stashy, dankiel
 */

const NAMED_EXACT = new Set([
  'proxy',
  'unique',
  'name',
  'qaban',
  'qandroi',
  'qandroid',
  'user 180',
  'user_180',
  'user180',
  'crd',
  'sgtashy',
  'sgtahy',
  'stashy',
  'dankiel',
]);

/** user 180 / user_180 / user-180 / user180 */
const USER_180 = /^user[\s_-]*180$/i;

/** proxy / proxy_ / proxyuser… */
const PROXY_JUNK = /^proxy([\s_-]|$)/i;

/** unique / unique_ / uniqueuser… */
const UNIQUE_JUNK = /^unique([\s_-]|$)/i;

/** literal handle "name" or name_… */
const NAME_JUNK = /^name([\s_-]|$)/i;

/** qaban / qandroi / qandroid… */
const QA_DEVICE_JUNK = /^(qaban|qandroi|qandroid)([\s_-]|$)/i;

/** crd / crd_… */
const CRD_JUNK = /^crd([\s_-]|$)/i;

/** sgtashy / sgtahy / stashy… */
const STASHY_JUNK = /^(sgtashy|sgtahy|stashy)([\s_-]|$)/i;

/** dankiel… */
const DANKIEL_JUNK = /^dankiel([\s_-]|$)/i;

function looksLikeNamedFake(part: string): boolean {
  if (!part) return false;
  if (NAMED_EXACT.has(part)) return true;
  if (USER_180.test(part)) return true;
  if (PROXY_JUNK.test(part)) return true;
  if (UNIQUE_JUNK.test(part)) return true;
  if (NAME_JUNK.test(part)) return true;
  if (QA_DEVICE_JUNK.test(part)) return true;
  if (CRD_JUNK.test(part)) return true;
  if (STASHY_JUNK.test(part)) return true;
  if (DANKIEL_JUNK.test(part)) return true;
  return false;
}

export function isGenuineAppUser(username: string, userId = '', displayName = ''): boolean {
  const id = String(userId || '').trim();
  if (!id) return false;

  const handle = String(username || '').trim().toLowerCase();
  const display = String(displayName || '').trim().toLowerCase();
  if (!handle && !display) return false;

  for (const part of [handle, display]) {
    if (!part) continue;
    if (looksLikeNamedFake(part)) return false;
  }

  return true;
}
