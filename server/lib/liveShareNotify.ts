/**
 * Injected from server/index after sendToUserGlobal is defined (avoids circular imports).
 */

type Notifier = (userId: string, event: string, data: unknown) => number;

let notifier: Notifier | null = null;

export function setLiveShareNotifier(fn: Notifier): void {
  notifier = fn;
}

export function notifyLiveShareRecipient(userId: string, data: unknown): number {
  if (!notifier) return 0;
  return notifier(userId, "live_share", data);
}
