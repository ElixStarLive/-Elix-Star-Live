// Deep Link & Back Button Handler

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const ROOT_PATHS = new Set(['/', '/feed', '/friends', '/inbox', '/profile', '/login']);
const WEB_HOSTS = new Set(['www.elixstarlive.co.uk', 'elixstarlive.co.uk']);

function navigateFromDeepLinkUrl(url: string, navigate: (path: string) => void): void {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname || '/';

    // Custom scheme: elixstar://video/<id>
    if (parsed.protocol === 'elixstar:') {
      const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
      const type = parts[0];
      const id = parts[1];
      if (type && id) {
        if (type === 'video') { navigate(`/video/${id}`); return; }
        if (type === 'user') { navigate(`/profile/${id}`); return; }
        if (type === 'live') { navigate(`/live/${id}`); return; }
        if (type === 'hashtag') { navigate(`/hashtag/${id}`); return; }
      }
      navigate('/feed');
      return;
    }

    // HTTPS App Links / Universal Links
    if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && WEB_HOSTS.has(host)) {
      const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
      const type = parts[0];
      const id = parts[1];
      if (type === 'video' && id) { navigate(`/video/${id}`); return; }
      if (type === 'profile' && id) { navigate(`/profile/${id}`); return; }
      if (type === 'live' && id) { navigate(`/live/${id}`); return; }
      if (type === 'watch' && id) { navigate(`/watch/${id}`); return; }
      if (type === 'hashtag' && id) { navigate(`/hashtag/${id}`); return; }
      if (path && path !== '/') { navigate(path); return; }
    }
  } catch {
    // Fall through to feed.
  }
  navigate('/feed');
}

export const useDeepLinks = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let urlHandle: { remove: () => Promise<void> } | null = null;
    let backHandle: { remove: () => Promise<void> } | null = null;

    CapacitorApp.addListener('appUrlOpen', (event: { url: string }) => {
      navigateFromDeepLinkUrl(event.url, navigate);
    }).then(h => { urlHandle = h; });

    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        const modalEvent = new CustomEvent('app:back-button');
        const handled = !document.dispatchEvent(modalEvent);
        if (handled) return;

        if (canGoBack && !ROOT_PATHS.has(window.location.pathname)) {
          window.history.back();
        } else {
          CapacitorApp.minimizeApp();
        }
      }).then(h => { backHandle = h; });
    }

    return () => {
      urlHandle?.remove().catch(() => {});
      backHandle?.remove().catch(() => {});
    };
  }, [navigate]);
};

// Generate shareable deep link
export const generateDeepLink = (type: 'video' | 'user' | 'live' | 'hashtag', id: string): string => {
  return `elixstar://${type}/${id}`;
};

// Generate web fallback link
export const generateWebLink = (type: 'video' | 'user' | 'live' | 'hashtag', id: string): string => {
  const baseUrl = 'https://www.elixstarlive.co.uk';
  const path =
    type === 'user' ? `profile/${id}` :
    type === 'hashtag' ? `hashtag/${id}` :
    type === 'live' ? `live/${id}` :
    `video/${id}`;
  return `${baseUrl}/${path}`;
};

// Generate universal link (tries deep link, falls back to web)
export const generateUniversalLink = (type: 'video' | 'user' | 'live' | 'hashtag', id: string): string => {
  if (typeof window !== 'undefined') {
    const isNative = /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
    if (isNative) {
      return generateDeepLink(type, id);
    }
  }
  return generateWebLink(type, id);
};
