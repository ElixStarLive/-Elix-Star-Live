// Deep Link & Back Button Handler

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const ROOT_PATHS = new Set(['/', '/feed', '/friends', '/inbox', '/profile', '/login']);

export const useDeepLinks = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let urlHandle: { remove: () => Promise<void> } | null = null;
    let backHandle: { remove: () => Promise<void> } | null = null;

    CapacitorApp.addListener('appUrlOpen', (event: { url: string }) => {
      const url = event.url;
      
      const videoMatch = url.match(/(?:elixstar|app):\/\/video\/([^?]+)/);
      if (videoMatch) { navigate(`/video/${videoMatch[1]}`); return; }
      
      const userMatch = url.match(/(?:elixstar|app):\/\/user\/([^?]+)/);
      if (userMatch) { navigate(`/profile/${userMatch[1]}`); return; }
      
      const liveMatch = url.match(/(?:elixstar|app):\/\/live\/([^?]+)/);
      if (liveMatch) { navigate(`/live/${liveMatch[1]}`); return; }
      
      const hashtagMatch = url.match(/(?:elixstar|app):\/\/hashtag\/([^?]+)/);
      if (hashtagMatch) { navigate(`/hashtag/${hashtagMatch[1]}`); return; }
      
      navigate('/feed');
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
  }, []);
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
