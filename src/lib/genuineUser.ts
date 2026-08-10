/**
 * Owner allowlist — ONLY these real accounts stay in Share / Inbox circles / suggestions.
 * Everyone else is removed.
 *
 * Keep: Elix Star Live, Anya Emily, admin account, daniel, crd, Sandra Monica,
 *       Andrei Ionut Berica
 */

function compactLabel(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s.-]+/g, '');
}

const ALLOWED_COMPACT = new Set([
  'elixstarlive',
  'anyaemily',
  'admin',
  'adminaccount',
  'admn',
  'admnaccount',
  'daniel',
  'crd',
  'crdstar',
  'sandramonica',
  'sandamonica',
  'andreiionutberica',
  'andreiionut',
  'andreiberica',
]);

function isAllowedLabel(part: string): boolean {
  const c = compactLabel(part);
  if (!c) return false;
  if (ALLOWED_COMPACT.has(c)) return true;
  // Andrei Ionut Berica — allow compact variants with name tokens
  if (c.includes('andrei') && c.includes('berica')) return true;
  if (c.includes('andrei') && c.includes('ionut')) return true;
  return false;
}

export function isGenuineAppUser(username: string, userId = '', displayName = ''): boolean {
  const id = String(userId || '').trim();
  if (!id) return false;

  const handle = String(username || '').trim();
  const display = String(displayName || '').trim();
  if (!handle && !display) return false;

  if (handle && isAllowedLabel(handle)) return true;
  if (display && isAllowedLabel(display)) return true;
  return false;
}
