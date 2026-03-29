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
export const APP_PRODUCTION_ORIGIN = "https://www.elixstarlive.co.uk";

/** On localhost we use same-origin so Vite proxy (or backend on 8080) handles /api */
function isLocalDev(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export function getApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL ?? env?.VITE_API_URL ?? "")
    .toString()
    .trim()
    .replace(/\/$/, "");

  if (isLocalDev()) {
    // Browser: same-origin / Vite proxy. Native: WebView hostname may still be localhost while the API is on the internet;
    // never return "" on native (relative /api would hit the WebView host, not elixstarlive.co.uk).
    if (Capacitor.isNativePlatform()) {
      if (fromEnv) return fromEnv;
      return APP_PRODUCTION_ORIGIN.replace(/\/$/, "");
    }
    return "";
  }

  if (fromEnv) return fromEnv;

  // Shipped iOS/Android app: always call the real API with an absolute origin (JWT in memory;
  // do not rely on relative fetch or cookie edge cases in the WebView).
  if (Capacitor.isNativePlatform()) {
    return APP_PRODUCTION_ORIGIN.replace(/\/$/, "");
  }

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
