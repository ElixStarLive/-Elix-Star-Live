/**
 * Injected from server/index after sendToUserGlobal is defined (avoids circular imports).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Notifier = (userId: string, event: string, data: any) => number;

let notifier: Notifier | null = null;

export function setLiveShareNotifier(fn: Notifier): void {
  notifier = fn;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function notifyLiveShareRecipient(userId: string, data: any): number {
  if (!notifier) return 0;
  return notifier(userId, "live_share", data);
}
