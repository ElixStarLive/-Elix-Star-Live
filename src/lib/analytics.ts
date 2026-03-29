import { apiUrl } from './api';

// Analytics Event Tracking

export type AnalyticsEvent =
  // Video events
  | 'video_view_start'
  | 'video_view_stop'
  | 'video_view'
  | 'video_like'
  | 'video_unlike'
  | 'video_like_toggle'
  | 'video_comment'
  | 'video_share'
  | 'video_share_open'
  | 'video_save'
  | 'video_save_toggle'
  | 'video_not_interested'
  | 'video_report'
  | 'video_report_open'
  | 'video_download'
  | 'video_link_copy'
  | 'video_toggle_mute'
  | 'video_toggle_mute_blocked_global'
  | 'video_autoplay_sound_blocked'
  | 'video_comments_open'
  | 'video_profile_open'
  | 'video_music_open'
  | 'video_follow_toggle'
  | 'video_upload'
  | 'video_upload_failed'
  // Upload events
  | 'upload_started'
  | 'upload_progress'
  | 'upload_completed'
  | 'upload_failed'
  | 'upload_select_audio'
  | 'upload_preview_audio_blocked_global_mute'
  | 'upload_post_start'
  | 'upload_post_success'
  | 'upload_toggle_no_audio'
  // Live events
  | 'live_join'
  | 'live_leave'
  | 'live_start'
  | 'live_end'
  | 'live_chat_message'
  // Gift events
  | 'gift_sent'
  | 'gift_send'
  | 'gift_received'
  | 'gift_combo'
  // Battle events
  | 'battle_started'
  | 'battle_ended'
  | 'battle_score_update'
  | 'battle_invite_sent'
  | 'battle_accept'
  | 'battle_decline'
  | 'booster_activated'
  | 'booster_activate'
  // Purchase events
  | 'purchase_initiated'
  | 'purchase_intent'
  | 'purchase_success'
  | 'purchase_failed'
  | 'purchase_restored'
  // User events
  | 'user_signup'
  | 'user_login'
  | 'user_logout'
  | 'user_follow'
  | 'user_unfollow'
  | 'user_block'
  | 'user_profile_view'
  | 'profile_view'
  | 'profile_update'
  | 'profile_avatar_change'
  // Search/Discovery
  | 'search_query'
  | 'hashtag_click'
  | 'hashtag_view'
  | 'trending_view'
  // Comments
  | 'comment_post'
  | 'comment_like'
  // Share
  | 'share_content'
  // Report
  | 'report_intent'
  | 'report_submit'
  // Support
  | 'support_ticket_submit'
  // Notifications
  | 'push_token_registered'
  | 'notification_received'
  | 'notification_tap'
  | 'local_notification_show'
  // App lifecycle
  | 'app_open'
  | 'app_background'
  | 'app_foreground'
  | 'app_error'
  | 'screen_view';

export interface AnalyticsProperties {
  [key: string]: string | number | boolean | null | undefined;
}

class AnalyticsService {
  private isInitialized = false;
  private userId: string | null = null;
  private sessionId: string = this.generateSessionId();

  initialize() {
    if (this.isInitialized) return;
    
    this.isInitialized = true;
    this.trackEvent('app_open', {});
  }

  setUserId(userId: string | null) {
    this.userId = userId;
    
  }

  trackEvent(event: AnalyticsEvent, properties: AnalyticsProperties = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    const enrichedProperties = {
      ...properties,
      session_id: this.sessionId,
      user_id: this.userId,
      timestamp: new Date().toISOString(),
      platform: this.getPlatform(),
      app_version: '1.5.0',
    };



    // TODO: Send to analytics platform
    // if (window.posthog) {
    //   window.posthog.capture(event, enrichedProperties);
    // }

    // Send to backend for server-side tracking
    this.sendToBackend(event, enrichedProperties);
  }

  trackScreenView(screenName: string, properties: AnalyticsProperties = {}) {
    this.trackEvent('screen_view', {
      screen_name: screenName,
      ...properties,
    });
  }

  trackWatchTime(videoId: string, duration: number) {
    this.trackEvent('video_view_stop', {
      video_id: videoId,
      watch_duration: duration,
      completion_rate: 0, // Calculate based on video length
    });
  }

  private sendToBackend(event: AnalyticsEvent, properties: AnalyticsProperties) {
    // Skip backend tracking in development to avoid errors
    if (import.meta.env.DEV) return;

    // Send to backend for server-side storage
    fetch(apiUrl('/api/analytics/track'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, properties }),
    }).catch(() => {
      // Fail silently - analytics shouldn't break app
    });
  }

  private getPlatform(): string {
    if (typeof window === 'undefined') return 'server';
    
    const ua = window.navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'web';
  }

  private generateSessionId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const analytics = new AnalyticsService();

// Convenience function
export const trackEvent = (event: AnalyticsEvent, properties?: AnalyticsProperties) => {
  analytics.trackEvent(event, properties);
};

export const trackScreenView = (screenName: string, properties?: AnalyticsProperties) => {
  analytics.trackScreenView(screenName, properties);
};
