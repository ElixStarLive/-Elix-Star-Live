import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === "android" || ent.name === "ios") {
      continue;
    }
    const p = resolve(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

describe("release architecture contracts", () => {
  it("1. GBP ledger failure rolls back the paid gift (no swallowed catch)", () => {
    const wallet = read("server/lib/walletNeon.ts");
    const start = wallet.indexOf("export async function neonDebitGiftWithCreatorCredit");
    const fn = wallet.slice(start, wallet.indexOf("export function creatorEarningHoldHours", start));
    expect(fn).toContain("await client.query(\"ROLLBACK\")");
    expect(fn).toContain("await postLedgerEntry");
    expect(fn).not.toContain("ledger skipped");
    expect(fn).not.toMatch(/catch \(ledgerErr\)/);
  });

  it("2. refund GBP failure does not acknowledge Apple/Google webhooks", () => {
    const wallet = read("server/lib/walletNeon.ts");
    const reverse = wallet.slice(wallet.indexOf("export async function neonReverseIapPurchase"));
    expect(reverse.indexOf("reversePurchaseFinancialsOnClient")).toBeLessThan(
      reverse.indexOf('await client.query("COMMIT")'),
    );
    const apple = read("server/routes/iapNotifications.ts");
    expect(apple).toContain('return res.status(500).json({ error: "reverse_failed" })');
    expect(apple).toContain('result.error !== "purchase_not_found"');
  });

  it("3. Stripe payout status failure does not permanently consume the webhook event", () => {
    const payout = read("server/lib/monetisation/payoutProvider.ts");
    const confirm = payout.slice(payout.indexOf("export async function confirmPayoutFromProvider"));
    expect(confirm).toContain("applyGbpWithdrawalStatusOnClient");
    expect(confirm.indexOf("applyGbpWithdrawalStatusOnClient")).toBeLessThan(
      confirm.indexOf('await client.query("COMMIT")'),
    );
    expect(confirm).toContain("event not committed");
    const webhook = read("server/routes/webhook.ts");
    expect(webhook).toContain("if (!payout.ok)");
    expect(webhook).toContain('res.status(500).json({ error: "Webhook processing failed" })');
  });

  it("4-5. co-host self-leave frees one seat and does not end the live", () => {
    const handlers = read("server/websocket/handlers.ts");
    const start = handlers.indexOf('case "cohost_seat_leave"');
    const end = handlers.indexOf('case "cohost_seats_clear"', start);
    const block = handlers.slice(start, end);
    expect(block).toContain("removeCohostSlot(seats, targetUserId)");
    expect(block).not.toContain("removeActiveStream");
    expect(block).not.toContain("stream_ended");
    expect(block).not.toContain("for (const seat of seats)");
  });

  it("6. WS room switching preserves owner map instead of disconnect()", () => {
    const ws = read("src/lib/websocket.ts");
    const connect = ws.slice(ws.indexOf("connect("), ws.indexOf("private closeSocket"));
    expect(connect).toContain("this.closeSocket()");
    expect(connect).toContain("this.dropOwnersNotForRoom(roomId)");
    expect(connect).not.toContain("this.disconnect()");
    expect(ws).toContain("private ownerRooms = new Map<string, string>()");
  });

  it("7. foreground reconnect uses the current authenticated JWT", () => {
    const ws = read("src/lib/websocket.ts");
    expect(ws).toContain("reconnectOnForeground()");
    const fg = ws.slice(ws.indexOf("reconnectOnForeground()"), ws.indexOf("private attemptReconnect"));
    expect(fg).toContain("useAuthStore.getState().session?.access_token || this.token");
  });

  it("14. production client source contains no debug ingest host", () => {
    const hits: string[] = [];
    for (const file of walkTs(resolve(root, "src"))) {
      const text = readFileSync(file, "utf8");
      if (text.includes("127.0.0.1:7890") || text.includes("localhost:7890")) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });

  it("pins Apple JWS trust to Apple Root CA G3", () => {
    const apple = read("server/lib/appleIap.ts");
    expect(apple).toContain("63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179");
    expect(apple).toContain("chainTerminatesAtAppleRootG3");
    expect(apple).not.toContain("does not look Apple-issued");
  });

  it("enforces Apple appAccountToken on coin verify", () => {
    const misc = read("server/routes/misc.ts");
    expect(misc).toContain("appAccountTokenForUserId(user.sub)");
    expect(misc).toContain("missing_app_account_token");
    expect(misc).toContain("app_account_token_mismatch");
  });

  it("Google consume is server-authoritative after durable credit", () => {
    const misc = read("server/routes/misc.ts");
    expect(misc).toContain("consumeGooglePlayAfterCredit");
    expect(misc).toContain("googlePlayConsume");
    const consume = read("server/lib/googlePlayConsume.ts");
    expect(consume).toContain('type: "google_play_consume"');
  });
});
