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
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-rose-600/90 backdrop-blur-md text-white text-center py-3 px-4 flex items-center justify-center gap-3 text-sm font-medium shadow-lg animate-in slide-in-from-top duration-300">
      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      <span>No internet connection. Reconnecting...</span>
    </div>
  );
}
