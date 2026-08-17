/**
 * Live gift WS *out* — test-coin gift_sent + gift goals only.
 * Paid gifts use sendLivePaidGift → giftSend REST (never gift_sent).
 */

import { LIVE_WS_OUT, liveWsSend } from '../../../lib/live';
import { websocket } from '../../../lib/websocket';

type LivePayload = Record<string, unknown>;

/** Test-coin gift request. Server debits the test balance before it plays. */
export function liveGiftSentWs(payload: LivePayload): void {
  liveWsSend(LIVE_WS_OUT.gift_sent, payload);
}

export type TestCoinGiftAck = {
  ok: boolean;
  status: string;
  /** Server test balance after the attempt; null when the server did not say. */
  balance: number | null;
  battlePoints: number;
};

const TEST_GIFT_ACK_TIMEOUT_MS = 8000;

/**
 * Send a test-coin gift and wait for the server's verdict.
 *
 * The test balance lives on the server, so the animation, the chat row and the
 * battle points must follow the server's `gift_ack` — not a local guess. The
 * ack is matched by `requestId`, so a slow ack can never be credited to a
 * different gift.
 */
export function sendTestCoinGiftWs(
  payload: LivePayload,
): Promise<TestCoinGiftAck> {
  const requestId = `tg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise<TestCoinGiftAck>((resolve) => {
    let settled = false;
    const finish = (ack: TestCoinGiftAck) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      websocket.off('gift_ack', onAck);
      resolve(ack);
    };
    const onAck = (data: unknown) => {
      const row = (data ?? {}) as {
        requestId?: unknown;
        status?: unknown;
        testCoinsBalance?: unknown;
        battlePoints?: unknown;
      };
      if (row.requestId !== requestId) return;
      const status = typeof row.status === 'string' ? row.status : 'failed';
      finish({
        ok: status === 'test',
        status,
        balance:
          typeof row.testCoinsBalance === 'number'
            ? Math.max(0, Math.floor(row.testCoinsBalance))
            : null,
        battlePoints:
          typeof row.battlePoints === 'number' ? row.battlePoints : 0,
      });
    };
    const timer = setTimeout(
      () => finish({ ok: false, status: 'timeout', balance: null, battlePoints: 0 }),
      TEST_GIFT_ACK_TIMEOUT_MS,
    );
    websocket.on('gift_ack', onAck);
    liveWsSend(LIVE_WS_OUT.gift_sent, { ...payload, requestId });
  });
}

export function liveGiftGoalSet(payload: LivePayload): void {
  liveWsSend(LIVE_WS_OUT.gift_goal_set, payload);
}

export function liveGiftGoalClear(payload?: LivePayload): void {
  liveWsSend(LIVE_WS_OUT.gift_goal_clear, payload ?? {});
}

