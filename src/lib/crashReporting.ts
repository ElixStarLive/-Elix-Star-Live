import { IS_STORE_BUILD } from '../config/build';

const isDev = import.meta.env.DEV;

class CrashReportingService {
  private isInitialized = false;

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
    } catch {
      // Logging failed silently
    }
  }

  async logMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    if (!this.isInitialized) return;

    try {
      if (isDev) console.log('[' + level.toUpperCase() + '] ' + message);
    } catch {
      // Logging failed silently
    }
  }

  async setUserIdentifier(_userId: string) {
    if (!this.isInitialized) return;
  }

  async setCustomKey(_key: string, _value: string) {
    if (!this.isInitialized) return;
  }
}

export const crashReporting = new CrashReportingService();
