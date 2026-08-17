/**
 * Authoritative Google Play consumable consume after durable coin credit.
 * Credit is idempotent; consume is retried via the job queue until Google accepts it.
 */
import { getPool } from "./postgres";
import { logger } from "./logger";
import { enqueueJob } from "./jobQueue";
import { consumeGooglePlayProduct } from "./googlePlaySubscriptions";

export async function markGooglePurchaseConsumed(externalPurchaseId: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `UPDATE elix_processed_purchases
        SET google_consumed_at = COALESCE(google_consumed_at, NOW())
      WHERE external_purchase_id = $1`,
    [externalPurchaseId],
  );
}

export async function consumeGooglePlayAfterCredit(input: {
  productId: string;
  purchaseToken: string;
  externalPurchaseId: string;
}): Promise<void> {
  const result = await consumeGooglePlayProduct({
    productId: input.productId,
    purchaseToken: input.purchaseToken,
  });
  if (result.ok) {
    await markGooglePurchaseConsumed(input.externalPurchaseId);
    return;
  }
  logger.error(
    { productId: input.productId, status: result.status, detail: result.detail },
    "Google Play consume after credit failed — enqueue retry",
  );
  await enqueueJob({
    type: "google_play_consume",
    productId: input.productId,
    purchaseToken: input.purchaseToken,
    externalPurchaseId: input.externalPurchaseId,
  });
}

export async function processGooglePlayConsumeJob(input: {
  productId: string;
  purchaseToken: string;
  externalPurchaseId: string;
}): Promise<void> {
  const result = await consumeGooglePlayProduct({
    productId: input.productId,
    purchaseToken: input.purchaseToken,
  });
  if (result.ok) {
    await markGooglePurchaseConsumed(input.externalPurchaseId);
    return;
  }
  if (result.retryable) {
    const queued = await enqueueJob({
      type: "google_play_consume",
      productId: input.productId,
      purchaseToken: input.purchaseToken,
      externalPurchaseId: input.externalPurchaseId,
    });
    if (!queued) {
      throw new Error(`google_play_consume_retry_enqueue_failed:${result.detail}`);
    }
    return;
  }
  throw new Error(`google_play_consume_failed:${result.detail}`);
}

/** Recover unconsumed Google tokens after credit (job worker / retention tick). */
export async function enqueueUnconsumedGooglePlayPurchases(limit = 20): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  const rows = await pool.query<{
    product_id: string;
    google_purchase_token: string;
    external_purchase_id: string;
  }>(
    `SELECT product_id, google_purchase_token, external_purchase_id
       FROM elix_processed_purchases
      WHERE provider = 'google'
        AND google_purchase_token IS NOT NULL
        AND google_consumed_at IS NULL
      ORDER BY processed_at ASC
      LIMIT $1`,
    [limit],
  );
  let n = 0;
  for (const row of rows.rows) {
    const ok = await enqueueJob({
      type: "google_play_consume",
      productId: String(row.product_id),
      purchaseToken: String(row.google_purchase_token),
      externalPurchaseId: String(row.external_purchase_id),
    });
    if (ok) n += 1;
  }
  return n;
}
