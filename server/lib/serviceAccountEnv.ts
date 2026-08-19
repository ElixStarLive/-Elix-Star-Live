/**
 * Parse Google/Firebase service-account JSON from env.
 * Coolify/.env paste often breaks raw JSON (multiline, wrapping quotes, base64).
 * Accepts:
 * - compact JSON object string
 * - multiline JSON (when the platform injects a real multiline env value)
 * - JSON wrapped in single/double quotes
 * - standard base64 of the JSON bytes
 * - FIREBASE_SERVICE_ACCOUNT_BASE64 / GOOGLE_SERVICE_ACCOUNT_BASE64 companions
 */
import { logger } from "./logger";

export type ServiceAccountCreds = {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
  project_info?: unknown;
  client?: unknown;
  [key: string]: unknown;
};

function stripWrappingQuotes(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function tryBase64Json(s: string): string | null {
  const t = s.trim().replace(/\s+/g, "");
  if (t.length < 16 || t.includes("{") || t.includes(" ")) return null;
  // base64url or standard
  if (!/^[A-Za-z0-9+/_-]+=*$/.test(t)) return null;
  try {
    const decoded = Buffer.from(t.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    if (!decoded.trim().startsWith("{")) return null;
    return decoded;
  } catch {
    return null;
  }
}

function parseJsonObject(raw: string): ServiceAccountCreds {
  return JSON.parse(raw) as ServiceAccountCreds;
}

/** Base64 of a whole PEM. PEM text itself contains "-", so that rules it out. */
function tryBase64Pem(s: string): string | null {
  const t = s.trim().replace(/\s+/g, "");
  if (t.length < 64 || t.includes("-")) return null;
  if (!/^[A-Za-z0-9+/_]+=*$/.test(t)) return null;
  try {
    const decoded = Buffer.from(t.replace(/_/g, "/"), "base64").toString("utf8");
    return decoded.includes("-----BEGIN ") && decoded.includes("PRIVATE KEY") ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Rebuild a PEM private key from the shapes an env UI paste produces.
 *
 * A .p8 is multi-line, and `jose.importPKCS8` / `createPrivateKey` need the line
 * structure — but Coolify and .env files routinely deliver it as one line with the
 * newlines either escaped as literal "\n" or deleted outright. Deleted newlines
 * are the damaging case: the value still starts with -----BEGIN PRIVATE KEY-----,
 * so every presence check passes while the key never parses, and iOS purchase
 * verification returns "unavailable" for every buyer.
 *
 * This only repairs whitespace and transport encoding: the base64 body is taken
 * as pasted and re-wrapped at the 64 columns PEM expects. It never invents key
 * material, so a truncated paste still fails to parse — loudly, at boot.
 *
 * Must be the single normaliser for both the consumer and the boot check: if they
 * judge the value differently, boot passes on a key that cannot sign.
 */
export function normalizePrivateKeyPem(raw: string | undefined | null): string {
  if (!raw) return "";
  let text = stripWrappingQuotes(raw).trim();
  if (!text) return "";

  const decoded = tryBase64Pem(text);
  if (decoded) text = decoded;

  text = text.replace(/\\r\\n|\\n/g, "\n").replace(/\r\n/g, "\n");

  const match = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(text);
  if (!match) return text.trim();
  const body = match[2].replace(/\s+/g, "");
  if (!body) return text.trim();
  const wrapped = body.replace(/(.{64})/g, "$1\n").replace(/\n$/, "");
  return `-----BEGIN ${match[1]}-----\n${wrapped}\n-----END ${match[1]}-----\n`;
}

/**
 * Resolve service-account credentials from common env shapes.
 * @param primaryEnv e.g. FIREBASE_SERVICE_ACCOUNT_JSON
 * @param base64Env optional companion e.g. FIREBASE_SERVICE_ACCOUNT_BASE64
 */
export function loadServiceAccountFromEnv(
  primaryEnv: string,
  base64Env?: string,
): ServiceAccountCreds | null {
  const base64Raw = base64Env ? process.env[base64Env] : undefined;
  const primaryRaw = process.env[primaryEnv];

  const candidates: string[] = [];
  if (base64Raw && base64Raw.trim()) candidates.push(base64Raw);
  if (primaryRaw && primaryRaw.trim()) candidates.push(primaryRaw);

  if (candidates.length === 0) return null;

  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      let text = stripWrappingQuotes(candidate);

      // Coolify sometimes stores JSON with literal newlines (valid JSON).
      // Also accept base64 payload in either env var.
      const asB64 = tryBase64Json(text);
      if (asB64) text = asB64;

      // Some UIs double-encode: "\"{...}\"" after quote strip still escaped.
      if (text.includes('\\"') && text.includes("\\n") && !text.trim().startsWith("{")) {
        try {
          text = JSON.parse(`"${text.replace(/^"|"$/g, "")}"`) as string;
        } catch {
          /* keep text */
        }
      }

      const creds = parseJsonObject(text);

      // Normalize PEM: some pastes leave "\\n" as two chars after a bad round-trip.
      if (typeof creds.private_key === "string" && creds.private_key.includes("\\n")) {
        creds.private_key = creds.private_key.replace(/\\n/g, "\n");
      }

      if (!creds.client_email || !creds.private_key) {
        logger.error(
          {
            env: primaryEnv,
            hasClientEmail: Boolean(creds.client_email),
            hasPrivateKey: Boolean(creds.private_key),
            looksLikeGoogleServicesJson: Boolean(creds.project_info || creds.client),
            type: creds.type || null,
          },
          `${primaryEnv} is not a service account JSON (need client_email + private_key)`,
        );
        return null;
      }
      return creds;
    } catch (err) {
      lastErr = err;
    }
  }

  logger.error(
    { err: lastErr, env: primaryEnv, base64Env: base64Env || null },
    `Invalid ${primaryEnv} / ${base64Env || "base64"} — could not parse service account`,
  );
  return null;
}
