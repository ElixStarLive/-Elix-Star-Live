/**
 * Owner allowlist — ONLY these accounts stay in Share / Inbox circles / suggestions.
 * Everyone else is removed.
 *
 * Keep: Elix Star Live, Anya Emily, admin account, daniel, crd star, Sandra Monica
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
  'crdstar',
  'sandramonica',
  'sandamonica',
]);

function isAllowedLabel(part: string): boolean {
  const c = compactLabel(part);
  if (!c) return false;
  if (ALLOWED_COMPACT.has(c)) return true;
  // Allow slight handle variants: daniel123 → no; daniel_ok → no.
  // Only exact compact match or known phrase prefixes that equal a keep name.
  return false;
}

export function isGenuineAppUser(username: string, userId = '', displayName = ''): boolean {
  const id = String(userId || '').trim();
  if (!id) return false;

  const handle = String(username || '').trim();
  const display = String(displayName || '').trim();
  if (!handle && !display) return false;

  // Pass if username OR display name is on the owner keep list
  if (handle && isAllowedLabel(handle)) return true;
  if (display && isAllowedLabel(display)) return true;
  return false;
}
