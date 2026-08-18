/**
 * How long the Valkey claim on a gift transaction lives (`tryClaimTransaction`).
 * That claim is what keeps a gift's delivery side effects — battle score, gift
 * goal, engagement, the creator's animation — happening exactly once.
 */
export const GIFT_TRANSACTION_CLAIM_TTL_MS = 300_000;

/**
 * How long a settled gift stays deliverable.
 *
 * A settled transaction may only be delivered while its claim is certainly still
 * alive. Past that point the claim can have expired, and replaying the
 * transaction would score the battle a second time without paying for it — so
 * this window has to stay comfortably inside the claim TTL above. Both live here
 * together because the safety of one is a statement about the other; splitting
 * them across files is how the window silently outlives the claim.
 *
 * One definition, shared by the REST settlement path and the WebSocket
 * `gift_sent` verification query, so the two entry points can never disagree
 * about which gifts are live.
 */
export const GIFT_DELIVERY_WINDOW_MS = Math.floor(GIFT_TRANSACTION_CLAIM_TTL_MS * 0.4);

/** True while a gift settled at `settledAt` may still be delivered. */
export function isWithinGiftDeliveryWindow(
  settledAt: Date | number | null | undefined,
  now = Date.now(),
): boolean {
  if (settledAt == null) return false;
  const ms = settledAt instanceof Date ? settledAt.getTime() : Number(settledAt);
  if (!Number.isFinite(ms)) return false;
  return now - ms < GIFT_DELIVERY_WINDOW_MS;
}
