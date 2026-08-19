type JwtPayload = {
  iss?: unknown;
  sub?: unknown;
  exp?: unknown;
  nbf?: unknown;
  video?: unknown;
  [k: string]: unknown;
};

type VideoGrant = {
  room?: unknown;
  canPublish?: unknown;
  canSubscribe?: unknown;
  roomJoin?: unknown;
};

type LiveKitTokenSummary = {
  issuer: string | null;
  identity: string | null;
  room: string | null;
  canPublish: boolean | null;
  canSubscribe: boolean | null;
  roomJoin: boolean | null;
  expiresAtIso: string | null;
  notBeforeIso: string | null;
};

export function normalizeLiveKitSignalUrl(rawUrl: string): string {
  const input = String(rawUrl || '').trim();
  if (!input) return '';

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
    ? input
    : `${isLocalHost(input) ? 'ws' : 'wss'}://${input}`;

  try {
    const u = new URL(withScheme);
    if (u.protocol === 'https:') u.protocol = 'wss:';
    else if (u.protocol === 'http:') u.protocol = isLocalHost(u.hostname) ? 'ws:' : 'wss:';
    if (!isLocalHost(u.hostname) && u.protocol === 'ws:') u.protocol = 'wss:';
    return u.toString().replace(/\/$/, '');
  } catch {
    return input;
  }
}

export function summarizeLiveKitEndpoint(rawUrl: string): {
  normalizedUrl: string;
  host: string | null;
  protocol: string | null;
  isSecureWss: boolean;
  isLocalhost: boolean;
} {
  const normalizedUrl = normalizeLiveKitSignalUrl(rawUrl);
  try {
    const u = new URL(normalizedUrl);
    const host = u.host || null;
    const protocol = u.protocol || null;
    const isLocal = isLocalHost(u.hostname);
    return {
      normalizedUrl,
      host,
      protocol,
      isSecureWss: protocol === 'wss:',
      isLocalhost: isLocal,
    };
  } catch {
    return {
      normalizedUrl,
      host: null,
      protocol: null,
      isSecureWss: false,
      isLocalhost: false,
    };
  }
}

/**
 * Ask LiveKit itself why the signal upgrade failed. Browsers hide the WS
 * handshake response body, so a connect failure surfaces only as a generic
 * "websocket error". The validate endpoint returns the real server reason
 * (e.g. quota/plan limit, expired token, unknown room).
 *
 * Single request, failure path only — never a reconnect and never used to
 * treat a failed connection as connected.
 */
export async function probeLiveKitSignalReason(
  url: string,
  token: string,
): Promise<{ status: number | null; reason: string | null }> {
  const origin = normalizeLiveKitSignalUrl(url)
    .replace(/^wss:/i, 'https:')
    .replace(/^ws:/i, 'http:');
  if (!origin || !token) return { status: null, reason: null };
  try {
    const res = await fetch(`${origin}/rtc/validate?access_token=${encodeURIComponent(token)}`);
    const text = (await res.text()).slice(0, 300).trim();
    return { status: res.status, reason: text || null };
  } catch (e) {
    return { status: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

export function summarizeLiveKitToken(token: string): LiveKitTokenSummary {
  const payload = decodeJwtPayload(token);
  const video = ((payload?.video as VideoGrant | undefined) || {}) as VideoGrant;
  const exp = toEpochSeconds(payload?.exp);
  const nbf = toEpochSeconds(payload?.nbf);
  return {
    issuer: asString(payload?.iss),
    identity: asString(payload?.sub),
    room: asString(video.room),
    canPublish: asBoolean(video.canPublish),
    canSubscribe: asBoolean(video.canSubscribe),
    roomJoin: asBoolean(video.roomJoin),
    expiresAtIso: exp ? new Date(exp * 1000).toISOString() : null,
    notBeforeIso: nbf ? new Date(nbf * 1000).toISOString() : null,
  };
}

export function summarizeLiveKitConnectError(err: unknown): Record<string, unknown> {
  const e = err as Record<string, unknown> | null;
  const out: Record<string, unknown> = {
    message: err instanceof Error ? err.message : String(err),
    name: err instanceof Error ? err.name : null,
  };
  if (!e || typeof e !== 'object') return out;
  for (const key of ['code', 'reason', 'status', 'statusCode', 'type']) {
    if (key in e) out[key] = e[key];
  }
  const cause = e.cause;
  if (cause && typeof cause === 'object') {
    const c = cause as Record<string, unknown>;
    out.cause = {
      message: typeof c.message === 'string' ? c.message : null,
      name: typeof c.name === 'string' ? c.name : null,
      code: c.code ?? null,
      reason: c.reason ?? null,
      status: c.status ?? null,
      statusCode: c.statusCode ?? null,
    };
  }
  return out;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const compact = String(token || '').trim();
  const parts = compact.split('.');
  if (parts.length < 2) return null;
  const payload = parts[1];
  try {
    const json = decodeBase64Url(payload);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as JwtPayload;
  } catch {
    return null;
  }
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const b64 = normalized + pad;
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isLocalHost(host: string): boolean {
  const v = String(host || '').trim().toLowerCase();
  return v === 'localhost' || v === '127.0.0.1' || v === '::1';
}

function asString(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
}

function asBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  return null;
}

function toEpochSeconds(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
