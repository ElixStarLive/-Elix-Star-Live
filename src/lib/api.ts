/**
 * Single place for API and LiveKit URLs. No duplicate or broken connections.
 * Uses VITE_* from build or window.__ENV from /env.js at runtime.
 */

import { Capacitor } from "@capacitor/core";

const env = typeof window !== "undefined" ? (window as any).__ENV as Record<string, string> | undefined : undefined;

/**
 * Production site/API origin. Must match capacitor.config.ts `server.hostname`
 * (scheme https + this host). Used for Capacitor builds when VITE_API_URL is not set.
 */
const APP_PRODUCTION_ORIGIN = "https://www.elixstarlive.co.uk";

/** On localhost we use same-origin so Vite proxy (or backend on 8080) handles /api.
 * Native shipped apps run on http(s)://localhost / capacitor://localhost internally,
 * but must ALWAYS reach the real backend — never treat native as local dev. */
function isLocalDev(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export function getApiBase(): string {
  // Shipped native app must always hit the real production API (Neon/backend host).
  // Never use relative /api from the WebView localhost origin.
  if (Capacitor.isNativePlatform()) {
    const fromEnv = (import.meta.env.VITE_API_URL ?? env?.VITE_API_URL ?? "")
      .toString()
      .trim()
      .replace(/\/$/, "");
    if (fromEnv.startsWith("https://") || fromEnv.startsWith("http://")) {
      return fromEnv;
    }
    return APP_PRODUCTION_ORIGIN.replace(/\/$/, "");
  }

  const fromEnv = (import.meta.env.VITE_API_URL ?? env?.VITE_API_URL ?? "")
    .toString()
    .trim()
    .replace(/\/$/, "");

  if (isLocalDev()) {
    return "";
  }

  if (fromEnv) return fromEnv;

  // Browser deployment on the same host as the API: relative URLs.
  return "";
}

export function getLiveKitUrl(): string {
  return (import.meta.env.VITE_LIVEKIT_URL ?? env?.VITE_LIVEKIT_URL ?? '').toString().trim();
}

export function getWsUrl(): string {
  if (isLocalDev()) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  let ws = (import.meta.env.VITE_WS_URL ?? env?.VITE_WS_URL ?? "").toString().trim();
  if (!ws && Capacitor.isNativePlatform()) {
    // Native shipped app: derive WS from the real API origin, never the WebView's localhost host.
    ws = getApiBase();
  }
  if (!ws && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = `${proto}//${window.location.host}`;
  }
  if (ws.startsWith('https://')) ws = ws.replace('https://', 'wss://');
  else if (ws.startsWith('http://')) ws = ws.replace('http://', 'ws://');
  if (!ws.startsWith('ws://localhost') && ws.startsWith('ws://')) ws = ws.replace('ws://', 'wss://');
  return ws;
}

/** Full URL for an API path (e.g. apiUrl('/api/live/streams')) */
export function apiUrl(path: string): string {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
