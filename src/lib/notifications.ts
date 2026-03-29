// Push notifications — Capacitor native push; device tokens via POST /api/device-tokens.

import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  Token,
  PushNotificationSchema,
} from "@capacitor/push-notifications";
import { request } from "./apiClient";
import { useAuthStore } from "../store/useAuthStore";
import { trackEvent } from "./analytics";

// ── Service ───────────────────────────────────────────────────────────────────

class NotificationService {
  private isInitialized = false;
  private deviceToken: string | null = null;
  private autoRemoveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Escape HTML to prevent XSS in banner innerHTML */
  private escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

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
   * Initialize push notifications (native only).
   * Requests permission and registers the device token with the Hetzner backend.
   */
  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (this.isInitialized) return;

    try {
      const permStatus = await PushNotifications.requestPermissions();

      if (permStatus.receive === "granted") {
        await PushNotifications.register();

        await PushNotifications.addListener(
          "registration",
          this.handleRegistration.bind(this),
        );
        await PushNotifications.addListener(
          "pushNotificationReceived",
          this.handleNotificationReceived.bind(this),
        );
        await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          this.handleNotificationAction.bind(this),
        );

        this.isInitialized = true;
      }
    } catch {
      // Fail silently — push notifications are non-critical
    }
  }

  /**
   * Handle device token received from OS.
   * Registers the token with the Hetzner backend via POST /api/device-tokens.
   */
  private async handleRegistration(token: Token): Promise<void> {
    this.deviceToken = token.value;
    await this.registerTokenWithBackend();
  }

  /**
   * Send the stored device token to the backend for the current user.
   * Can be called multiple times safely — idempotent on the server.
   */
  async registerTokenWithBackend(): Promise<void> {
    if (!this.deviceToken) return;

    const user = useAuthStore.getState().user;
    if (!user) return;

    try {
      await request("/api/device-tokens", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          token: this.deviceToken,
          platform: Capacitor.getPlatform(),
        }),
      });

      trackEvent("push_token_registered", {
        platform: Capacitor.getPlatform(),
      });
    } catch {
      // Non-critical — token registration failure does not break the app
    }
  }

  /**
   * Handle notification received while the app is in the foreground.
   */
  private handleNotificationReceived(
    notification: PushNotificationSchema,
  ): void {
    this.showInAppNotification(notification);

    trackEvent("notification_received", {
      title: notification.title,
      foreground: true,
    });
  }

  /**
   * Handle notification tap / action (app was backgrounded or closed).
   */
  private handleNotificationAction(action: any): void {
    const notification = action.notification;
    const data = notification?.data ?? {};

    trackEvent("notification_tap", {
      title: notification?.title,
      action_url: data?.action_url,
    });

    if (data?.action_url && this.isSafeUrl(data.action_url)) {
      window.location.href = data.action_url;
    }
  }

  /**
   * Show a temporary in-app notification banner (foreground notifications).
   */
  private showInAppNotification(notification: PushNotificationSchema): void {
    const banner = document.createElement("div");
    banner.className =
      "fixed top-4 left-4 right-4 bg-[#13151A]/90 backdrop-blur-sm rounded-2xl p-4 shadow-2xl z-50 animate-slide-down";

    const safeTitle = this.escapeHtml(notification.title || "");
    const safeBody = this.escapeHtml(notification.body || "");

    banner.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 bg-[#C9A96E] rounded-full flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9">
            </path>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-bold text-white mb-1">${safeTitle}</p>
          <p class="text-sm text-white/80">${safeBody}</p>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    const remove = () => {
      banner.remove();
      if (this.autoRemoveTimer) {
        clearTimeout(this.autoRemoveTimer);
        this.autoRemoveTimer = null;
      }
    };

    banner.addEventListener("click", () => {
      remove();
      const actionUrl = notification.data?.action_url;
      if (actionUrl && this.isSafeUrl(actionUrl)) {
        window.location.href = actionUrl;
      }
    });

    if (this.autoRemoveTimer) clearTimeout(this.autoRemoveTimer);
    this.autoRemoveTimer = setTimeout(remove, 5000);
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

  /**
   * Unregister the current device token from the Hetzner backend.
   * Call on sign-out so the user stops receiving push notifications.
   */
  async unregisterToken(): Promise<void> {
    if (!this.deviceToken) return;

    const user = useAuthStore.getState().user;
    if (!user) return;

    try {
      await request("/api/device-tokens", {
        method: "DELETE",
        body: JSON.stringify({
          userId: user.id,
          token: this.deviceToken,
          platform: Capacitor.getPlatform(),
        }),
      });
    } catch {
      // Non-critical
    } finally {
      this.deviceToken = null;
    }
  }
}

export const notificationService = new NotificationService();
