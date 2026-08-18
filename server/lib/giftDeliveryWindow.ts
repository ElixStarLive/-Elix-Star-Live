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

/**
 * True while a settlement of this age may still be delivered.
 *
 * The age must be measured by whoever holds the settlement row — the database.
 * This used to take the settlement timestamp and subtract `Date.now()`, which
 * compares a database timestamp against the application clock: the two hosts do
 * not share a clock, so the REST path and the SQL query below could disagree
 * about the age of the very same gift by the skew between them.
 *
 * An unknown age is not deliverable.
 */
export function isWithinGiftDeliveryWindow(settledAgeMs: number | null | undefined): boolean {
  if (settledAgeMs == null || !Number.isFinite(settledAgeMs)) return false;
  return settledAgeMs < GIFT_DELIVERY_WINDOW_MS;
}
