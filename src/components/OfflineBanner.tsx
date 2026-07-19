import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[9999] flex justify-center px-3 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <div className="pointer-events-auto rounded-full bg-rose-600/90 backdrop-blur-md text-white px-4 py-1 flex items-center gap-2 text-xs font-medium shadow-lg animate-in slide-in-from-top duration-300 whitespace-nowrap">
        <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
        <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
        <span>No internet connection. Reconnecting...</span>
      </div>
    </div>
  );
}
