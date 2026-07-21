/** Runtime caps so long lives cannot grow chat/gift queues until OOM. */

export const LIVE_CHAT_MESSAGE_CAP = 200;
export const LIVE_GIFT_QUEUE_CAP = 8;

export function appendCapped<T>(prev: T[], item: T, cap: number): T[] {
  if (cap <= 0) return [item];
  if (prev.length < cap) return [...prev, item];
  const next = prev.slice(prev.length - (cap - 1));
  next.push(item);
  return next;
}
