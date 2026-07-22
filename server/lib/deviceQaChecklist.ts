/**
 * Device QA evidence checklist — fills OUTSIDE source review.
 * Mark scenarios PASS only with real device evidence.
 *
 * Copy to a local file, fill, keep offline (may contain device serials).
 * Do not commit filled evidence with PII.
 */
export type DeviceQaScenario =
  | "live_viewer_reconnect"
  | "live_host_reconnect"
  | "battle_reconnect"
  | "gift_near_disconnect"
  | "poll_ending_and_reconnect"
  | "cohost_reconnect"
  | "wifi_to_mobile_data"
  | "background_foreground"
  | "engagement_drawer_during_live"
  | "android_back_closes_drawer"
  | "liked_saved_pagination"
  | "unsaving_synchronization"
  | "slow_network_pagination_retry";

export type DeviceQaRow = {
  scenario: DeviceQaScenario;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  testAccountType: "normal" | "admin" | "host" | "viewer";
  expected: string;
  actual: string;
  pass: boolean;
  evidenceRef: string; // screenshot / recording path or ticket id
};

export const REQUIRED_DEVICE_QA_SCENARIOS: DeviceQaScenario[] = [
  "live_viewer_reconnect",
  "live_host_reconnect",
  "battle_reconnect",
  "gift_near_disconnect",
  "poll_ending_and_reconnect",
  "cohost_reconnect",
  "wifi_to_mobile_data",
  "background_foreground",
  "engagement_drawer_during_live",
  "android_back_closes_drawer",
  "liked_saved_pagination",
  "unsaving_synchronization",
  "slow_network_pagination_retry",
];
