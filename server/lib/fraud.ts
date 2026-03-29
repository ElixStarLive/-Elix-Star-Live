/**
 * Fraud / abuse signals — Valkey-backed velocity; fail-closed when Valkey missing for gift spend.
 */
import { getValkey, isValkeyConfigured } from "./valkey";
import { logger } from "./logger";

const GIFT_REST_WINDOW_SEC = 60;
const GIFT_REST_MAX = 45;
const IAP_VERIFY_WINDOW_SEC = 3600;
const IAP_VERIFY_MAX = 25;

export async function assertGiftRestVelocityOk(userId: string): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!isValkeyConfigured()) {
    return { ok: false, code: "FRAUD_CHECK_UNAVAILABLE" };
  }
  const v = getValkey();
  if (!v) return { ok: false, code: "FRAUD_CHECK_UNAVAILABLE" };
  const key = `fraud:gift_rest:${userId}`;
  try {
    const n = await v.incr(key);
    if (n === 1) await v.expire(key, GIFT_REST_WINDOW_SEC);
    if (n > GIFT_REST_MAX) {
      logger.warn({ userId, n }, "fraud: gift REST velocity exceeded");
      return { ok: false, code: "GIFT_RATE_LIMITED" };
    }
    return { ok: true };
  } catch (e) {
    logger.error({ err: e, userId }, "fraud gift check failed");
    return { ok: false, code: "FRAUD_CHECK_ERROR" };
  }
}

export async function assertIapVerifyVelocityOk(userId: string): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!isValkeyConfigured()) {
    return { ok: false, code: "FRAUD_CHECK_UNAVAILABLE" };
  }
  const v = getValkey();
  if (!v) return { ok: false, code: "FRAUD_CHECK_UNAVAILABLE" };
  const key = `fraud:iap_verify:${userId}`;
  try {
    const n = await v.incr(key);
    if (n === 1) await v.expire(key, IAP_VERIFY_WINDOW_SEC);
    if (n > IAP_VERIFY_MAX) {
      logger.warn({ userId, n }, "fraud: IAP verify velocity exceeded");
      return { ok: false, code: "IAP_VERIFY_RATE_LIMITED" };
    }
    return { ok: true };
  } catch (e) {
    logger.error({ err: e, userId }, "fraud IAP check failed");
    return { ok: false, code: "FRAUD_CHECK_ERROR" };
  }
}
