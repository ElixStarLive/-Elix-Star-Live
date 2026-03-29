import { Capacitor } from "@capacitor/core";
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

export async function request<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    const res = await fetch(apiUrl(path), {
      credentials: requestCredentials(),
      ...init,
      headers: { ...authHeaders(), ...(init.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        data: null,
        error: {
          message: body?.error ? String(body.error) : `HTTP_${res.status}`,
        },
      };
    }
    return { data: body as T, error: null };
  } catch (e: any) {
    return {
      data: null,
      error: { message: String(e?.message || "request_failed") },
    };
  }
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
    async signInWithPassword(input: { email: string; password: string }) {
      const r = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return {
        data: {
          user: r.data?.user ?? null,
          session: r.data?.session ?? null,
        },
        error: r.error,
      };
    },
    async signUp(input: {
      email: string;
      password: string;
      options?: { data?: { username?: string } };
    }) {
      const r = await request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          username: input.options?.data?.username,
        }),
      });
      return {
        data: {
          user: r.data?.user ?? null,
          session: r.data?.session ?? null,
        },
        error: r.error,
      };
    },
    async resend(input: { email?: string }) {
      return request("/api/auth/resend-confirmation", {
        method: "POST",
        body: JSON.stringify({ email: input.email }),
      });
    },
    async signOut() {
      const r = await request("/api/auth/logout", { method: "POST" });
      return { error: r.error };
    },
    async exchangeCodeForSession(_code?: string) {
      const r = await request("/api/auth/me");
      return {
        data: { session: r.data?.session ?? null },
        error: r.error,
      };
    },
    async resetPasswordForEmail(email: string) {
      return request("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },
    async updateUser(input: { password?: string }) {
      if (!input?.password)
        return {
          data: { user: null },
          error: { message: "password_required" },
        };
      const r = await request("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ password: input.password }),
      });
      return { data: { user: r.data?.user ?? null }, error: r.error };
    },
    async refreshSession() {
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
    async getByUsername(username: string) {
      return request(
        `/api/profiles/by-username/${encodeURIComponent(username)}`,
      );
    },
    async list() {
      const r = await request("/api/profiles");
      return {
        data: r.data?.profiles ?? [],
        error: r.error,
        count: Array.isArray(r.data?.profiles) ? r.data!.profiles.length : 0,
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
    async patch(userId: string, updates: Record<string, any>) {
      return request(`/api/profiles/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    },
    async follow(userId: string) {
      return request(
        `/api/profiles/${encodeURIComponent(userId)}/follow`,
        { method: "POST" },
      );
    },
    async unfollow(userId: string) {
      return request(
        `/api/profiles/${encodeURIComponent(userId)}/unfollow`,
        { method: "POST" },
      );
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
    async getByUser(userId: string) {
      const r = await request(
        `/api/videos/user/${encodeURIComponent(userId)}`,
      );
      return { data: r.data?.videos ?? [], error: r.error };
    },
    async create(video: Record<string, any>) {
      return request("/api/videos", {
        method: "POST",
        body: JSON.stringify(video),
      });
    },
    async remove(videoId: string) {
      return request(`/api/videos/${encodeURIComponent(videoId)}`, {
        method: "DELETE",
      });
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
    async listThreads() {
      const r = await request("/api/chat/threads");
      return { data: r.data?.threads ?? [], error: r.error };
    },
    async getThread(threadId: string) {
      return request(
        `/api/chat/threads/${encodeURIComponent(threadId)}`,
      );
    },
    async listMessages(threadId: string) {
      return request(
        `/api/chat/threads/${encodeURIComponent(threadId)}/messages`,
      );
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
    async createItem(item: Record<string, any>) {
      const r = await request("/api/shop/items", {
        method: "POST",
        body: JSON.stringify(item),
      });
      return { data: r.data?.item ?? r.data, error: r.error };
    },
  },

  reports: {
    async create(report: Record<string, any>) {
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
    async block(blockedUserId: string) {
      return request("/api/block-user", {
        method: "POST",
        body: JSON.stringify({ blockedUserId }),
      });
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

  wallet: {
    async getBalance() {
      return request("/api/wallet");
    },
    async getTransactions() {
      return request("/api/wallet/transactions");
    },
  },

  coinPackages: {
    async list() {
      return request("/api/coin-packages");
    },
  },

  activity: {
    async list() {
      return request("/api/activity");
    },
  },
};
