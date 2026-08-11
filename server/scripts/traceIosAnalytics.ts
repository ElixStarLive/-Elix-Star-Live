/**
 * Read-only trace of any iOS-tagged analytics events in production Neon.
 * Filters by properties.platform = 'ios' (Capacitor emits this via lib/iap.ts
 * reportIapStage etc.), plus recent user auth sessions and general recent
 * analytics events. Prints last N hours.
 *
 * Usage: npx tsx server/scripts/traceIosAnalytics.ts [hoursBack=12] [limit=200]
 */
import "../config.ts";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

const hoursArg = Number(process.argv[2]);
const limitArg = Number(process.argv[3]);
const HOURS = Number.isFinite(hoursArg) && hoursArg > 0 ? hoursArg : 12;
const LIMIT = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 200;

const url = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
const pool = new pg.Pool({
  connectionString: url,
  max: 1,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

async function q<T = Record<string, unknown>>(
  sql: string,
  params: unknown[],
): Promise<{ rows: T[]; error?: string }> {
  try {
    const r = await pool.query(sql, params);
    return { rows: r.rows as T[] };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function main(): Promise<void> {
  const iosEvents = await q(
    `SELECT id::text, user_id::text, event, properties, created_at::text
       FROM elix_analytics_events
      WHERE properties->>'platform' = 'ios'
        AND created_at >= NOW() - ($1 || ' hours')::interval
      ORDER BY created_at DESC
      LIMIT $2`,
    [String(HOURS), LIMIT],
  );

  const iapDebugEvents = await q(
    `SELECT id::text, user_id::text, event, properties, created_at::text
       FROM elix_analytics_events
      WHERE event = 'iap_debug'
        AND created_at >= NOW() - ($1 || ' hours')::interval
      ORDER BY created_at DESC
      LIMIT $2`,
    [String(HOURS), LIMIT],
  );

  const anyRecentEvents = await q(
    `SELECT event, COUNT(*)::int AS c
       FROM elix_analytics_events
      WHERE created_at >= NOW() - ($1 || ' hours')::interval
      GROUP BY event
      ORDER BY c DESC
      LIMIT 50`,
    [String(HOURS)],
  );

  const iosEventsByStage = new Map<string, number>();
  for (const row of iosEvents.rows) {
    const props = (row as { properties?: unknown }).properties;
    const stage =
      props && typeof props === "object" && "stage" in props
        ? String((props as { stage?: unknown }).stage)
        : String((row as { event?: unknown }).event ?? "unknown");
    iosEventsByStage.set(stage, (iosEventsByStage.get(stage) ?? 0) + 1);
  }

  const iosByUser = new Map<string, number>();
  for (const row of iosEvents.rows) {
    const uid = String((row as { user_id?: unknown }).user_id ?? "anon");
    iosByUser.set(uid, (iosByUser.get(uid) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        status: "OK",
        atUtc: new Date().toISOString(),
        windowHours: HOURS,
        summary: {
          iosEventsCount: iosEvents.rows.length,
          iapDebugEventsCount: iapDebugEvents.rows.length,
          iosByStage: Object.fromEntries(
            [...iosEventsByStage.entries()].sort((a, b) => b[1] - a[1]),
          ),
          iosByUser: Object.fromEntries(iosByUser),
        },
        iosEventsSample: iosEvents,
        iapDebugEventsSample: iapDebugEvents,
        anyEventTotalsInWindow: anyRecentEvents,
      },
      null,
      2,
    ),
  );

  await pool.end();
}

main().catch((err) => {
  console.log(JSON.stringify({ status: "ERROR", message: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
