/**
 * Normalizes successful login / register JSON from server/routes/auth.ts
 * (`authLoginRegisterBody`). Invariants: plain objects, non-empty user.id, non-empty JWT string
 * in session.access_token or session.accessToken. No UI; no schema library — mirrors server contract.
 */

function asPlainObject(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function nonEmptySessionToken(session: Record<string, unknown>): string | null {
  const a = session.access_token;
  const b = session.accessToken;
  if (typeof a === "string" && a.length > 0) return a;
  if (typeof b === "string" && b.length > 0) return b;
  return null;
}

export type NormalizedAuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  email_confirmed_at?: string;
  created_at?: string;
  [key: string]: unknown;
};

/** Parse success bodies with `user` + `session` (`authLoginRegisterBody`): login, register, and GET /api/auth/me. */
export function parseAuthLoginRegisterResponse(data: unknown): {
  user: NormalizedAuthUser;
  accessToken: string;
} | null {
  const root = asPlainObject(data);
  if (!root) return null;

  const userRaw = asPlainObject(root.user);
  const sessionRaw = asPlainObject(root.session);
  if (!userRaw || !sessionRaw) return null;

  const idVal = userRaw.id;
  if (idVal === undefined || idVal === null) return null;
  const id = String(idVal).trim();
  if (!id) return null;

  const accessToken = nonEmptySessionToken(sessionRaw);
  if (!accessToken) return null;

  const meta = userRaw.user_metadata;
  let user_metadata: Record<string, unknown> | undefined;
  if (meta !== undefined && meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
    user_metadata = meta as Record<string, unknown>;
  }

  const user: NormalizedAuthUser = {
    id,
    ...(typeof userRaw.email === "string" ? { email: userRaw.email } : {}),
    ...(user_metadata !== undefined ? { user_metadata } : {}),
    ...(typeof userRaw.email_confirmed_at === "string"
      ? { email_confirmed_at: userRaw.email_confirmed_at }
      : {}),
    ...(typeof userRaw.created_at === "string" ? { created_at: userRaw.created_at } : {}),
  };

  return { user, accessToken };
}
