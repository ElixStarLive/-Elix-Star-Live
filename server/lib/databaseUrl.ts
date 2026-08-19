/**
 * Normalize DATABASE_URL for node-pg / pg-connection-string.
 *
 * Node prints SECURITY WARNING when sslmode is prefer, require, or verify-ca because
 * those are currently aliases for verify-full; pg v9 will change semantics.
 * Setting sslmode=verify-full explicitly silences the warning and locks intended behavior.
 *
 * @see https://www.postgresql.org/docs/current/libpq-ssl.html
 */
/**
 * Rewrite a Neon connection string onto the **direct** endpoint by dropping the
 * `-pooler` label from the host.
 *
 * Application queries belong on the pooled endpoint (see `connectPostgres`), but
 * the migration runner does not: Neon's pooler is pgbouncer in transaction
 * pooling mode, where `pg_advisory_lock` — a *session* lock — is taken on
 * whichever server backend happens to serve that one statement, and pgbouncer
 * hands that backend to the next client immediately afterwards. Measured against
 * the pooled endpoint, two clients held the same exclusive key at once (so the
 * "one writer" guarantee was not in force at all), `pg_advisory_unlock` released
 * nothing, and the key stayed granted to an idle pgbouncer backend that nobody
 * owns. Once that happens every later migration run blocks on the lock forever —
 * a deploy whose release command never returns.
 *
 * Non-Neon and already-direct URLs are returned unchanged.
 */
export function directDatabaseUrl(urlString: string): string {
  const trimmed = urlString.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    if (!u.hostname.includes("neon.tech")) return trimmed;
    const [first, ...rest] = u.hostname.split(".");
    if (!first.endsWith("-pooler")) return trimmed;
    u.hostname = [first.slice(0, -"-pooler".length), ...rest].join(".");
    return u.toString();
  } catch {
    return trimmed;
  }
}

export function normalizeDatabaseUrl(urlString: string): string {
  const trimmed = urlString.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    const params = u.searchParams;
    const sm = params.get("sslmode");
    const isNeon = u.hostname.includes("neon.tech");

    if (isNeon) {
      params.set("sslmode", "verify-full");
      return u.toString();
    }
    if (sm === "prefer" || sm === "require" || sm === "verify-ca") {
      params.set("sslmode", "verify-full");
      return u.toString();
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}
