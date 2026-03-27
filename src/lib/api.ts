/**
 * Single place for API and LiveKit URLs. No duplicate or broken connections.
 * Uses VITE_* from build or window.__ENV from /env.js at runtime.
 */

import { Capacitor } from '@capacitor/core';

const env = typeof window !== 'undefined' ? (window as any).__ENV as Record<string, string> | undefined : undefined;

/** On localhost we use same-origin so Vite proxy (or backend on 8080) handles /api */
function isLocalDev(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export function getApiBase(): string {
  const base = (import.meta.env.VITE_API_URL ?? env?.VITE_API_URL ?? "").toString().trim();
  const normalized = base ? base.replace(/\/$/, "") : "";

  if (isLocalDev()) {
    // In native WebView, localhost points to the device/emulator, not your backend.
    if (Capacitor.isNativePlatform() && normalized) return normalized;
    return "";
  }

  return normalized;
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
