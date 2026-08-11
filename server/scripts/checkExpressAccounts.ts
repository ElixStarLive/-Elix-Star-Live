import "../config.ts";
import Stripe from "stripe";

process.env.ELIX_STRIPE_CONNECT_MODE = "test";

async function main() {
  const key = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  if (!key.startsWith("sk_test_")) {
    console.log(JSON.stringify({ ok: false, error: "STRIPE_SECRET_KEY_TEST_missing" }));
    process.exit(2);
  }
  const s = new Stripe(key, { apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion });
  const ids = [
    "acct_1U1CBSEBKvSEZoIE",
    "acct_1U1CA2EBKvO3SSIC",
    "acct_1U1CA9EBKvSgqC6X",
  ];
  const accounts = [];
  for (const id of ids) {
    try {
      const a = await s.accounts.retrieve(id);
      accounts.push({
        id,
        type: a.type,
        controller: (a as { controller?: { type?: string } }).controller?.type ?? null,
        charges_enabled: a.charges_enabled,
        payouts_enabled: a.payouts_enabled,
        details_submitted: a.details_submitted,
        currently_due: a.requirements?.currently_due?.slice(0, 12) ?? [],
        disabled_reason: a.requirements?.disabled_reason ?? null,
      });
    } catch (e) {
      accounts.push({ id, error: e instanceof Error ? e.message : "fail" });
    }
  }
  const listed = await s.accounts.list({ limit: 10 });
  const recent = listed.data.map((a) => ({
    id: a.id,
    type: a.type,
    payouts_enabled: a.payouts_enabled,
    details_submitted: a.details_submitted,
    created: a.created,
  }));
  console.log(
    JSON.stringify(
      {
        anyExpressPayoutsEnabled: accounts.some((a) => "payouts_enabled" in a && a.payouts_enabled === true),
        accounts,
        recent,
      },
      null,
      2,
    ),
  );
}
main();
