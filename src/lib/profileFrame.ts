/** CSS px per mm (1in = 25.4mm, 1in = 96px). */
const CSS_PX_PER_MM = 96 / 25.4;

/**
 * Increase gold profile ring outer diameter by `mm` (avatar scales with {@link PROFILE_RING_INNER_RATIO}).
 */
export function profileRingOuterAddMm(baseOuterPx: number, mm: number): number {
  return Math.max(16, Math.round(baseOuterPx + mm * CSS_PX_PER_MM));
}

/** Extra outer diameter for live/spectator MVP rings vs previous 36 / 35 / 24px bases. */
export const PROFILE_RING_SIZE_BUMP_MM = 3;

/** Live top-bar MVP avatars. */
export const LIVE_MVP_PROFILE_RING_PX = 28;

/** Live chat message user avatar circle — app-wide standard for level badges. */
export const LEVEL_BADGE_RING_PX = 26;
export const CHAT_PROFILE_RING_PX = LEVEL_BADGE_RING_PX;

/** Spectator top bar MVP row. */
export const SPECTATOR_MVP_PROFILE_RING_PX = 28;

/** Battle bottom MVP row (3 per side). */
export const SPECTATOR_BATTLE_PROFILE_RING_PX = 26;

/** Battle MVP row (6 circles): horizontal offset from column edge; lower = more inward. */
export const BATTLE_MVP_ROW_EDGE_OFFSET_MM = 1;

/** Battle video column height — 3mm shorter so chat does not cover MVP circles. */
export const LIVE_BATTLE_VIDEO_HEIGHT = 'calc(44dvh - 3mm)' as const;

/** Battle-mode chat scroll area — shorter + sits lower. */
export const LIVE_BATTLE_CHAT_HEIGHT = 'calc(20dvh + 1cm)' as const;

/** Nudge battle chat toward bottom bar (clears MVP row). */
export const LIVE_BATTLE_CHAT_SHIFT_Y = '3mm' as const;

/**
 * Clears host profile + Weekly/Diamond/Membership/Explore capsules.
 * Morning (10:00) clearance: safe-area + 90px — restore exact top profile location.
 */
export const LIVE_TOP_OVERLAY_OFFSET =
  'calc(env(safe-area-inset-top, 0px) + 90px)' as const;

/** Red animated ring thickness (px) around live avatars. */
export const LIVE_AVATAR_RING_THICKNESS_PX = 3.5;

/** Conic gradient ring for LIVE avatars (Shop, Friends, feed sidebar). */
export const LIVE_AVATAR_RING_GRADIENT =
  'conic-gradient(from 180deg, #ff0040, #ff2500, #ff0040, #ff6a00, #ff0040)';

export function liveAvatarRingMaskStyle(thicknessPx = LIVE_AVATAR_RING_THICKNESS_PX): {
  background: string;
  WebkitMask: string;
  mask: string;
} {
  const t = `${thicknessPx}px`;
  const mask = `radial-gradient(farthest-side, transparent calc(100% - ${t}), #000 calc(100% - ${t}))`;
  return {
    background: LIVE_AVATAR_RING_GRADIENT,
    WebkitMask: mask,
    mask,
  };
}

/** Chat LV green pill — compact capsule beside the avatar circle (app-wide standard). */
export const LEVEL_BADGE_PILL_PX = 22;
export const CHAT_LEVEL_PILL_SIZE_PX = LEVEL_BADGE_PILL_PX;

/** Live bottom action row — sit on the writing/labels, safe-area inset only. */
export const LIVE_BOTTOM_ACTION_PADDING = 'max(2px, env(safe-area-inset-bottom, 0px))' as const;

/** Chat scroll area clears the bottom icon + label row. */
export const LIVE_BOTTOM_ACTION_RESERVE =
  'calc(52px + max(2px, env(safe-area-inset-bottom, 0px)))' as const;

/** Main host avatar in live top bar (next to name pill). */
export const LIVE_TOP_AVATAR_RING_PX = 48;

/** Live top-bar name/Join capsule height (shorter than avatar so the bar is not oversized). */
export const CREATOR_NAME_PILL_HEIGHT_PX = 36;

/** Shared shell: avatar + name + Join/Follow as one rounded capsule. */
export const CREATOR_NAME_PILL_CLASSNAME =
  'relative flex items-center min-w-0 rounded-full border border-[#FFFFFF]/60 bg-[#111111]/80 z-[15] overflow-visible' as const;

/** Inline styles for the host capsule; merge with `style` if needed. */
export function getCreatorNamePillStyle(overrides?: Record<string, string | number | undefined>): Record<string, string | number> {
  return {
    boxShadow: '0 0 8px rgba(255,255,255,0.25)',
    height: CREATOR_NAME_PILL_HEIGHT_PX,
    ...overrides,
  };
}

/** Feed / discover cards: small round creator thumb was 32 px — same +3 mm bump as live rings. */
export const LIVE_FEED_CARD_AVATAR_PX = profileRingOuterAddMm(32, PROFILE_RING_SIZE_BUMP_MM);

/** For You inline live: placeholder avatar was 96 px — +3 mm. */
export const INLINE_LIVE_PLACEHOLDER_AVATAR_PX = profileRingOuterAddMm(96, PROFILE_RING_SIZE_BUMP_MM);

/** Live Discover grid fallback circle was 64 px — +3 mm. */
export const LIVE_DISCOVER_GRID_AVATAR_PX = profileRingOuterAddMm(64, PROFILE_RING_SIZE_BUMP_MM);

/** Main profile page hero avatar (round photo under header). */
export const PROFILE_PAGE_AVATAR_PX = 96;

/**
 * Inner photo diameter vs outer box for stacks using `/royce/default-avatar.svg`.
 * Canonical ratio used app-wide so every gold-frame avatar centers identically.
 */
export const PROFILE_RING_INNER_RATIO = 0.68;

/**
 * Keep story rings on the same inner-hole geometry as profile rings so all circles
 * match visually across Profile/Friends/Following/Search/Live surfaces.
 */
export const STORY_RING_INNER_RATIO = PROFILE_RING_INNER_RATIO;
export const PROFILE_RING_IMAGE_LIFT_MM = 0.8;

export function profileRingInnerPx(outerPx: number): number {
  return Math.max(2, Math.round(outerPx * PROFILE_RING_INNER_RATIO));
}

export function storyRingInnerPx(outerPx: number): number {
  return Math.max(2, Math.round(outerPx * STORY_RING_INNER_RATIO));
}
