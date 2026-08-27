/**
 * The "remember email" preference on the sign-in form.
 *
 * Only the identifier is ever stored. The password is deliberately not, and
 * never was: keeping it in local storage would put a reusable credential
 * somewhere any injected script can read it.
 */

const ENABLED_KEY = 'elix.login.remember';
const IDENTIFIER_KEY = 'elix.login.identifier';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Blocked by privacy settings; the form still works, it just will not remember.
    return null;
  }
}

export function readRemembered(): { enabled: boolean; identifier: string } {
  const store = storage();
  if (!store) return { enabled: false, identifier: '' };

  const enabled = store.getItem(ENABLED_KEY) === 'true';
  return { enabled, identifier: enabled ? (store.getItem(IDENTIFIER_KEY) ?? '') : '' };
}

export function writeRemembered(enabled: boolean, identifier: string): void {
  const store = storage();
  if (!store) return;

  store.setItem(ENABLED_KEY, String(enabled));
  if (enabled) store.setItem(IDENTIFIER_KEY, identifier);
  else store.removeItem(IDENTIFIER_KEY);
}
