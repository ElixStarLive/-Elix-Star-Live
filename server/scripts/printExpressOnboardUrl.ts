import "../config.ts";
import { randomUUID } from "crypto";
import { initPostgres, getPool } from "../lib/postgres.ts";
import { requireValue } from "./_env.ts";

process.env.ELIX_STRIPE_CONNECT_MODE = "test";

async function main() {
  await initPostgres();
  const pool = requireValue(getPool(), "postgres pool");
  const { createOrGetPayoutAccount } = await import("../lib/monetisation/payoutProvider.ts");
  const id = `express_user_${randomUUID()}`;
  await pool.query(
    `INSERT INTO elix_payout_methods (id, user_id, type, is_default, details)
     VALUES ($1,$2,'stripe_connect',TRUE,'{}'::jsonb)`,
    [`pm_${randomUUID()}`, id],
  );
  const r = await createOrGetPayoutAccount(id);
  console.log(
    JSON.stringify(
      {
        creatorId: id,
        accountId: r.accountId,
        onboardingUrl: r.onboardingUrl,
        ok: r.ok,
        error: r.error || null,
      },
      null,
      2,
    ),
  );
}
main();
