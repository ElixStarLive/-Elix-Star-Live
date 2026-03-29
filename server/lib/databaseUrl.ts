/**
 * Normalize DATABASE_URL for node-pg / pg-connection-string.
 *
 * Node prints SECURITY WARNING when sslmode is prefer, require, or verify-ca because
 * those are currently aliases for verify-full; pg v9 will change semantics.
 * Setting sslmode=verify-full explicitly silences the warning and locks intended behavior.
 *
 * @see https://www.postgresql.org/docs/current/libpq-ssl.html
 */
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
