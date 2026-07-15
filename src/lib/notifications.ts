// Notifications — web-only. Native push (Capacitor Push / Firebase) has been removed.

import { trackEvent } from "./analytics";

// ── Service ───────────────────────────────────────────────────────────────────

class NotificationService {
  /** Only allow same-origin or relative URLs to prevent open redirects */
  private isSafeUrl(url: string): boolean {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  /**
   * Native push initialization is no longer used.
   * Kept as a safe no-op so existing callers continue to work.
   */
  async initialize(): Promise<void> {
    return;
  }

  /**
   * No native device token to register without push notifications.
   * Kept as a safe no-op so existing callers continue to work.
   */
  async registerTokenWithBackend(): Promise<void> {
    return;
  }

  /**
   * No native device token to unregister without push notifications.
   * Kept as a safe no-op so existing callers continue to work.
   */
  async unregisterToken(): Promise<void> {
    return;
  }

  /**
   * Request browser notification permission (web).
   */
  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;

    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  /**
   * Show a local OS notification (web, when permission is granted).
   */
  showLocalNotification(title: string, body: string, actionUrl?: string): void {
    if (!("Notification" in window) || Notification.permission !== "granted")
      return;

    const notif = new Notification(title, {
      body,
      icon: "/apple-touch-icon.svg",
      badge: "/favicon.svg",
      tag: "anber-notification",
    });

    notif.onclick = () => {
      if (actionUrl && this.isSafeUrl(actionUrl)) {
        window.location.href = actionUrl;
      }
      notif.close();
    };

    trackEvent("local_notification_show", { title });
  }
}

export const notificationService = new NotificationService();
