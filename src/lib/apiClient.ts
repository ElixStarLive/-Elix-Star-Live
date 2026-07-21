import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { apiUrl } from "./api";
import { useAuthStore } from "../store/useAuthStore";

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().session?.access_token;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** Native: Bearer-only (no dependency on HttpOnly cookie persistence in WebView). Web: cookies still sent for same-site flows. */
function requestCredentials(): RequestCredentials {
  return Capacitor.isNativePlatform() ? "omit" : "include";
}

const REQUEST_TIMEOUT_MS = 20_000;

function normalizeHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  return { ...(headers as Record<string, string>) };
}

function parseJsonBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return undefined;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return undefined;
}

function asJsonObject(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

function toResult<T>(
  status: number,
  body: Record<string, unknown> | null,
): { data: T | null; error: { message: string } | null } {
  if (!body) {
    return {
      data: null,
      error: {
        message:
          status >= 200 && status < 300
            ? "RESPONSE_NOT_JSON"
            : `HTTP_${status || 0}`,
      },
    };
  }
  if (status < 200 || status >= 300) {
    const baseMessage = body.error ? String(body.error) : `HTTP_${status}`;
    return {
      data: null,
      error: {
        message: body.detail ? `${baseMessage}: ${String(body.detail)}` : baseMessage,
      },
    };
  }
  return { data: body as T, error: null };
}

/**
 * Native path: CapacitorHttp (bypasses WebView CORS/CORP).
 * No AbortController — CapHttp + AbortSignal commonly breaks on Android.
 */
async function nativeCapacitorHttpRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: { message: string } | null }> {
  const method = (init.method || "GET").toUpperCase();
  const headers = {
    ...authHeaders(),
    ...normalizeHeaders(init.headers),
  };
  const response = await CapacitorHttp.request({
    url: apiUrl(path),
    method,
    headers,
    data: parseJsonBody(init.body ?? undefined),
    connectTimeout: REQUEST_TIMEOUT_MS,
    readTimeout: REQUEST_TIMEOUT_MS,
    responseType: "json",
  });
  const status = Number(response.status || 0);
  return toResult<T>(status, asJsonObject(response.data));
}

/**
 * Fallback native path: plain fetch WITHOUT AbortSignal (AbortSignal breaks Cap patched fetch).
 */
async function nativeFetchRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: { message: string } | null }> {
  const { signal: _ignored, ...rest } = init;
  // AbortSignal breaks Capacitor's patched fetch, so guard against a hung
  // request with a timeout race instead of aborting the fetch itself.
  const res = await Promise.race([
    fetch(apiUrl(path), {
      credentials: "omit",
      ...rest,
      headers: { ...authHeaders(), ...(init.headers || {}) },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("request_timeout")), REQUEST_TIMEOUT_MS),
    ),
  ]);
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json") || ct.includes("+json");
  if (!isJson) {
    return {
      data: null,
      error: { message: res.ok ? "RESPONSE_NOT_JSON" : `HTTP_${res.status}` },
    };
  }
  const body = asJsonObject(await res.json().catch(() => null));
  return toResult<T>(res.status, body);
}

async function webRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    const hasExternalSignal = !!init.signal;
    const controller = hasExternalSignal ? null : new AbortController();
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      : null;
    const res = await fetch(apiUrl(path), {
      credentials: requestCredentials(),
      ...init,
      headers: { ...authHeaders(), ...(init.headers || {}) },
      signal: init.signal || controller?.signal,
    });
    if (timeoutId !== null) clearTimeout(timeoutId);

    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json") || ct.includes("+json");
    if (!isJson) {
      return {
        data: null,
        error: { message: res.ok ? "RESPONSE_NOT_JSON" : `HTTP_${res.status}` },
      };
    }
    const body = asJsonObject(await res.json().catch(() => null));
    return toResult<T>(res.status, body);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e || "request_failed");
    return { data: null, error: { message: msg || "request_failed" } };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- default `any` preserves the loose public `api.*` return contract relied on by consumers
export async function request<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: { message: string } | null }> {
  const result = !Capacitor.isNativePlatform()
    ? await webRequest<T>(path, init)
    : await (async () => {
        // Prefer native HTTP bridge, then fall back to WebView fetch (needs server CORP cross-origin).
        try {
          return await nativeCapacitorHttpRequest<T>(path, init);
        } catch {
          try {
            return await nativeFetchRequest<T>(path, init);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e || "request_failed");
            return { data: null, error: { message: msg || "request_failed" } };
          }
        }
      })();

  return result;
}

export const api = {
  auth: {
    async getSession() {
      const session = useAuthStore.getState().session || null;
      return { data: { session }, error: null };
    },
    async getUser() {
      const r = await request("/api/auth/me");
      return {
        data: { user: r.data?.user ?? null },
        error: r.error,
      };
    },
    async exchangeCodeForSession(_code?: string) {
      const r = await request("/api/auth/me");
      return {
        data: { session: r.data?.session ?? null },
        error: r.error,
      };
    },
  },

  profiles: {
    async get(userId: string) {
      return request(`/api/profiles/${encodeURIComponent(userId)}`);
    },
    async list() {
      const r = await request("/api/profiles");
      return {
        data: r.data?.profiles ?? [],
        error: r.error,
        count: Array.isArray(r.data?.profiles) ? (r.data as NonNullable<typeof r.data>).profiles.length : 0,
      };
    },
    async getFollowerCount(userId: string) {
      const r = await request(
        `/api/profiles/${encodeURIComponent(userId)}/followers`,
      );
      return {
        data: null,
        count: Number(r.data?.count ?? 0),
        error: r.error,
      };
    },
    async getFollowingCount(userId: string) {
      const r = await request(
        `/api/profiles/${encodeURIComponent(userId)}/following`,
      );
      return {
        data: null,
        count: Number(r.data?.count ?? 0),
        error: r.error,
      };
    },
  },

  videos: {
    async get(videoId: string) {
      return request(`/api/videos/${encodeURIComponent(videoId)}`);
    },
    async list() {
      const r = await request("/api/videos");
      return { data: r.data?.videos ?? [], error: r.error };
    },
  },

  chat: {
    async ensureThread(otherUserId: string) {
      const r = await request("/api/chat/threads/ensure", {
        method: "POST",
        body: JSON.stringify({ otherUserId }),
      });
      return {
        data: r.data?.threadId ? { id: r.data.threadId } : null,
        error: r.error,
      };
    },
    async sendMessage(threadId: string, text: string) {
      return request(
        `/api/chat/threads/${encodeURIComponent(threadId)}/messages`,
        { method: "POST", body: JSON.stringify({ text }) },
      );
    },
  },

  shop: {
    async listItems() {
      const r = await request("/api/shop/items");
      return { data: r.data?.items ?? [], error: r.error };
    },
    async createItem(item: Record<string, unknown>) {
      const r = await request("/api/shop/items", {
        method: "POST",
        body: JSON.stringify(item),
      });
      return { data: r.data?.item ?? r.data, error: r.error };
    },
    async deleteItem(id: string) {
      const r = await request(`/api/shop/items/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return { data: r.data, error: r.error };
    },
  },

  reports: {
    async create(report: Record<string, unknown>) {
      return request("/api/report", {
        method: "POST",
        body: JSON.stringify(report),
      });
    },
  },

  blocked: {
    async list() {
      return request<{ blocked_user_id: string; username?: string; display_name?: string; avatar_url?: string }[]>("/api/blocked-users");
    },
    async unblock(blockedUserId: string) {
      return request("/api/unblock-user", {
        method: "POST",
        body: JSON.stringify({ blockedUserId }),
      });
    },
  },

  gifts: {
    async getCatalog() {
      return request("/api/gifts/catalog");
    },
  },
};
