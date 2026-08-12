/**
 * Shared creator membership purchase — Apple/Google IAP only (never Stripe).
 * Used by Live host battle-joiner + Spectator (+ Battle watchers on those screens).
 */
import { platform } from '../../lib/platform';
import { purchaseMembership, getMembershipStatus } from '../../lib/iap';
import { useAuthStore } from '../../store/useAuthStore';

/** Display price matching configured product — store charges the real IAP price. */
export const MEMBERSHIP_DISPLAY_PRICE = '£9.00';

const PENDING_CREATOR_KEY = 'elix_pending_membership_creator';
const PENDING_OPEN_PANEL_KEY = 'elix_pending_membership_open_panel';

export function stashPendingMembershipPurchase(creatorId: string): void {
  const id = String(creatorId || '').trim();
  if (!id || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_CREATOR_KEY, id);
    sessionStorage.setItem(PENDING_OPEN_PANEL_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function peekPendingMembershipCreator(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const id = sessionStorage.getItem(PENDING_CREATOR_KEY)?.trim() || '';
    return id || null;
  } catch {
    return null;
  }
}

function shouldOpenMembershipPanelAfterAuth(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(PENDING_OPEN_PANEL_KEY) === '1';
  } catch {
    return false;
  }
}

/** Consume open-panel flag once after login/register (keeps creator id for buy). */
export function consumePendingMembershipOpenPanel(): boolean {
  if (!shouldOpenMembershipPanelAfterAuth()) return false;
  if (typeof sessionStorage === 'undefined') return false;
  try {
    sessionStorage.removeItem(PENDING_OPEN_PANEL_KEY);
  } catch {
    /* ignore */
  }
  return true;
}

function clearPendingMembershipPurchase(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_CREATOR_KEY);
    sessionStorage.removeItem(PENDING_OPEN_PANEL_KEY);
  } catch {
    /* ignore */
  }
}

export function loginReturnPath(pathname: string, search = ''): string {
  const path = String(pathname || '').trim() || '/';
  const q = String(search || '');
  return `${path}${q}`;
}

export type MembershipPurchaseResult = {
  ok: boolean;
  alreadyActive?: boolean;
  error?: string;
  needsLogin?: boolean;
  cancelled?: boolean;
};

/**
 * One shared entry: auth check → native IAP → server verify via purchaseMembership.
 * Never fakes success.
 */
export async function purchaseCreatorMembership(creatorId: string): Promise<MembershipPurchaseResult> {
  const id = String(creatorId || '').trim();
  if (!id) return { ok: false, error: 'Creator unavailable' };

  const { session, user } = useAuthStore.getState();
  if (!session?.access_token || !user?.id) {
    stashPendingMembershipPurchase(id);
    return { ok: false, error: 'Not authenticated', needsLogin: true };
  }
  if (id === user.id) {
    return { ok: false, error: 'You cannot subscribe to your own membership' };
  }
  if (!platform.isNative) {
    return { ok: false, error: 'Membership is only available in the app' };
  }

  const status = await getMembershipStatus(id);
  if (status.status?.active) {
    clearPendingMembershipPurchase();
    return { ok: true, alreadyActive: true };
  }

  const result = await purchaseMembership(id);
  if (result.success && result.status?.active !== false) {
    clearPendingMembershipPurchase();
    return { ok: true };
  }
  const err = result.error || 'Membership purchase failed';
  if (err === 'Purchase cancelled') {
    return { ok: false, error: err, cancelled: true };
  }
  return { ok: false, error: err };
}
