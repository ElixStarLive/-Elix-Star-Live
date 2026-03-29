import { IS_STORE_BUILD } from '../config/build';
import { getApiBase } from './api';

const isDev = import.meta.env.DEV;

class CrashReportingService {
  private isInitialized = false;
  private userId: string | null = null;
  private customKeys: Record<string, string> = {};

  async initialize() {
    if (this.isInitialized) return;

    try {
      if (IS_STORE_BUILD || import.meta.env.VITE_ENABLE_CRASH_REPORTING === 'true') {
        this.isInitialized = true;
        if (isDev) console.log('Crash reporting initialized');
      }
    } catch {
      // Initialization failed silently in production
    }
  }

  async logError(error: Error, context?: Record<string, any>) {
    if (!this.isInitialized) return;

    try {
      if (isDev) {
        console.error('Crash Report:', {
          message: error.message,
          stack: error.stack,
          name: error.name,
          context,
        });
      }
      this.sendToBackend('error', error.message, {
        stack: error.stack,
        name: error.name,
        ...context,
      });
    } catch {
      // Logging failed silently
    }
  }

  async logMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    if (!this.isInitialized) return;

    try {
      if (isDev) console.log('[' + level.toUpperCase() + '] ' + message);
      if (level === 'error') {
        this.sendToBackend(level, message);
      }
    } catch {
      // Logging failed silently
    }
  }

  async setUserIdentifier(userId: string) {
    if (!this.isInitialized) return;
    this.userId = userId;
  }

  async setCustomKey(key: string, value: string) {
    if (!this.isInitialized) return;
    this.customKeys[key] = value;
  }

  private sendToBackend(level: string, message: string, extra?: Record<string, any>) {
    try {
      const base = getApiBase();
      const url = base ? `${base}/api/analytics/track` : '/api/analytics/track';
      const payload = {
        event: 'client_error',
        properties: {
          level,
          message,
          userId: this.userId,
          ...this.customKeys,
          ...extra,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        },
      };
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Never throw from crash reporting
    }
  }
}

export const crashReporting = new CrashReportingService();
