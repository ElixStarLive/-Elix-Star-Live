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

/** Spectator top bar MVP row. */
export const SPECTATOR_MVP_PROFILE_RING_PX = 28;

/** Battle bottom MVP row (3 per side). */
export const SPECTATOR_BATTLE_PROFILE_RING_PX = 20;

/** Chat LV green pill only; circle uses {@link LIVE_MVP_PROFILE_RING_PX}. */
export const CHAT_LEVEL_PILL_SIZE_PX = Math.max(16, Math.round((22 * LIVE_MVP_PROFILE_RING_PX) / 36));

/** Main host avatar in live top bar (next to name pill). */
export const LIVE_TOP_AVATAR_RING_PX = 48;

/** Name / likes pill behind host label — ~20 mm less right padding than old `pr-16` (4 rem), min 3 rem so Join/Follow still fit. */
export const CREATOR_NAME_PILL_PADDING_RIGHT = 'max(3rem,calc(4rem - 20mm))' as const;

/** Shared Tailwind classes for the host name / likes oval on LiveStream + Spectator top bar. */
export const CREATOR_NAME_PILL_CLASSNAME =
  'flex flex-col justify-center -ml-4 pl-4 h-8 min-h-8 rounded-full border border-[#FFFFFF]/60 bg-[#111111]/80 min-w-0 relative' as const;

/** Inline styles for the host name pill (padding + shadow); merge with `style` if needed. */
export function getCreatorNamePillStyle(overrides?: Record<string, string | number | undefined>): Record<string, string | number> {
  return {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    boxShadow: '0 0 8px rgba(255,255,255,0.25)',
    width: '30mm',
    paddingRight: CREATOR_NAME_PILL_PADDING_RIGHT,
    ...overrides,
  };
}

/** Feed / discover cards: small round creator thumb was 32 px — same +3 mm bump as live rings. */
export const LIVE_FEED_CARD_AVATAR_PX = profileRingOuterAddMm(32, PROFILE_RING_SIZE_BUMP_MM);

/** For You inline live: placeholder avatar was 96 px — +3 mm. */
export const INLINE_LIVE_PLACEHOLDER_AVATAR_PX = profileRingOuterAddMm(96, PROFILE_RING_SIZE_BUMP_MM);

/** Live Discover grid fallback circle was 64 px — +3 mm. */
export const LIVE_DISCOVER_GRID_AVATAR_PX = profileRingOuterAddMm(64, PROFILE_RING_SIZE_BUMP_MM);

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
