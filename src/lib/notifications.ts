/**
 * Notifications — web local notifications + native Capacitor Push token registration.
 * Native tokens are stored via POST /api/device-tokens; delivery uses the existing
 * server FCM/APNs paths in server/lib/push.ts when those env vars are configured.
 */

import { platform } from "./platform";
import { request } from "./apiClient";
import { useAuthStore } from "../store/useAuthStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { trackEvent } from "./analytics";

class NotificationService {
  private nativeToken: string | null = null;
  private listenersAttached = false;

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
   * Request permission and register for native push (Capacitor).
   * No-op on web.
   */
  async initialize(): Promise<void> {
    if (!platform.isNative) return;
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      if (!this.listenersAttached) {
        this.listenersAttached = true;
        await PushNotifications.addListener("registration", (token) => {
          this.nativeToken = token.value;
          void this.registerTokenWithBackend();
        });
        await PushNotifications.addListener("registrationError", () => {
          // Best-effort; do not crash the app if registration fails.
        });
      }

      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") return;
      await PushNotifications.register();
    } catch {
      // Plugin missing or unsupported on this build — leave as no-op.
    }
  }

  /**
   * Register the current native device token with the backend for the logged-in user.
   */
  async registerTokenWithBackend(): Promise<void> {
    if (!platform.isNative || !this.nativeToken) return;
    const { user } = useAuthStore.getState();
    if (!user?.id) return;
    // Respect the local "App notifications" preference.
    if (!useSettingsStore.getState().notificationsEnabled) return;
    try {
      await request("/api/device-tokens", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          token: this.nativeToken,
          platform: platform.isIOS ? "ios" : "android",
        }),
      });
    } catch {
      // Non-fatal — push is best-effort.
    }
  }

  /**
   * Unregister the current native device token on logout.
   */
  async unregisterToken(): Promise<void> {
    if (!platform.isNative) return;
    const { user } = useAuthStore.getState();
    if (!user?.id) {
      this.nativeToken = null;
      return;
    }
    try {
      await request("/api/device-tokens", {
        method: "DELETE",
        body: JSON.stringify({
          userId: user.id,
          platform: platform.isIOS ? "ios" : "android",
        }),
      });
    } catch {
      // Non-fatal
    } finally {
      this.nativeToken = null;
    }
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
