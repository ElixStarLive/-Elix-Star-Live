/**
 * Redacted Coolify → Neon identity fingerprint.
 * Run INSIDE the Coolify production container / one-off job:
 *
 *   npx tsx server/scripts/coolifyDbIdentityFingerprint.ts
 *
 * Prints host, database, user, migration tip — never password or full URL.
 */
import "./../config.ts";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

function redactHost(host: string): string {
  // ep-autumn-meadow-ab3wfwro-pooler.eu-west-2.aws.neon.tech
  // → ep-autumn-meadow-…eu-west-2
  const m = host.match(/^(ep-[a-z0-9-]+?)(?:-[a-z0-9]+)?\.(.+)$/i);
  if (!m) return host.replace(/^(.{12}).+(.{12})$/, "$1…$2");
  const leaf = m[2].replace(/\.aws\.neon\.tech$/i, "").replace(/\.neon\.tech$/i, "");
  return `${m[1]}-….${leaf}`;
}

const raw = (process.env.DATABASE_URL || "").trim();
if (!raw) {
  console.error("MISSING|DATABASE_URL");
  process.exit(1);
}

const url = normalizeDatabaseUrl(raw);
const parsed = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
const host = parsed.hostname;
const db = parsed.pathname.replace(/^\//, "").split("?")[0];
const user = parsed.username;

console.log("FINGERPRINT|host=" + redactHost(host));
console.log("FINGERPRINT|host_full_for_compare=" + host);
console.log("FINGERPRINT|database=" + db);
console.log("FINGERPRINT|user=" + user);
console.log("FINGERPRINT|password=REDACTED");

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 1,
});
const c = await pool.connect();
try {
  const id = await c.query(
    `SELECT current_database() AS database,
            current_schema() AS schema,
            current_user AS db_user,
            inet_server_addr()::text AS server_addr,
            inet_server_port() AS server_port`,
  );
  const row = id.rows[0];
  console.log("IDENTITY|current_database=" + row.database);
  console.log("IDENTITY|schema=" + row.schema);
  console.log("IDENTITY|current_user=" + row.db_user);
  console.log("IDENTITY|inet_server_addr=" + (row.server_addr || "null"));
  console.log("IDENTITY|inet_server_port=" + (row.server_port ?? "null"));

  const last = await c.query(
    `SELECT filename, applied_at
       FROM elix_schema_migrations
      ORDER BY filename DESC
      LIMIT 1`,
  );
  if (last.rows[0]) {
    console.log("MIGRATION|table=elix_schema_migrations");
    console.log("MIGRATION|last=" + last.rows[0].filename);
    console.log("MIGRATION|applied_at=" + last.rows[0].applied_at);
  } else {
    console.log("MIGRATION|last=NONE");
  }

  const total = await c.query(
    `SELECT COUNT(*)::int AS c FROM elix_schema_migrations`,
  );
  console.log("MIGRATION|count_total=" + total.rows[0].c);

  const tip = await c.query(
    `SELECT COUNT(*)::int AS c FROM elix_schema_migrations WHERE filename LIKE '20260722%'`,
  );
  console.log("MIGRATION|count_20260722=" + tip.rows[0].c);

  // Match helper vs known migrated local target (no secrets)
  const expectHostPart = "ep-autumn-meadow";
  const expectDb = "neondb";
  const expectLast = "20260722250000_engagement_admin_and_gifts_mission.sql";
  const matchHost = host.includes(expectHostPart);
  const matchDb = db === expectDb || row.database === expectDb;
  const matchLast = last.rows[0]?.filename === expectLast;
  console.log("COMPARE|host_matches_autumn_meadow=" + matchHost);
  console.log("COMPARE|database_is_neondb=" + matchDb);
  console.log("COMPARE|last_is_250000=" + matchLast);
  console.log(
    "COMPARE|matches_migrated_target=" +
      (matchHost && matchDb && matchLast ? "MATCH" : "MISMATCH_OR_INCOMPLETE"),
  );
  console.log(
    "NOTE|coolify_gate=PASS only if this script was run inside Coolify production with Coolify DATABASE_URL",
  );
} finally {
  c.release();
  await pool.end();
}
