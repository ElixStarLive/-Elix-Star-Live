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

/** Live host + chat: was 36px outer. */
export const LIVE_MVP_PROFILE_RING_PX = profileRingOuterAddMm(36, PROFILE_RING_SIZE_BUMP_MM);

/** Spectator top bar MVP row: was 35px outer. */
export const SPECTATOR_MVP_PROFILE_RING_PX = LIVE_MVP_PROFILE_RING_PX;

/** Spectator battle split rows: was 24px outer. */
export const SPECTATOR_BATTLE_PROFILE_RING_PX = LIVE_MVP_PROFILE_RING_PX;

/** Chat LV green pill only; circle uses {@link LIVE_MVP_PROFILE_RING_PX}. Smaller base (22 vs 32) than legacy combined scale. */
export const CHAT_LEVEL_PILL_SIZE_PX = Math.max(18, Math.round((22 * LIVE_MVP_PROFILE_RING_PX) / 36));

/** Main host avatar in live top bar (round ring next to name pill): +3 mm vs former 56 px base. */
export const LIVE_TOP_AVATAR_RING_PX = profileRingOuterAddMm(56, PROFILE_RING_SIZE_BUMP_MM);

/** Name / likes pill behind host label — ~20 mm less right padding than old `pr-16` (4 rem), min 3 rem so Join/Follow still fit. */
export const CREATOR_NAME_PILL_PADDING_RIGHT = 'max(3rem,calc(4rem - 20mm))' as const;

/** Shared Tailwind classes for the host name / likes oval on LiveStream + Spectator top bar. */
export const CREATOR_NAME_PILL_CLASSNAME =
  'flex flex-col justify-center -ml-4 pl-4 h-8 min-h-8 rounded-full border border-[#C9A96E]/60 bg-[#13151A]/80 min-w-0 relative' as const;

/** Inline styles for the host name pill (padding + shadow); merge with `style` if needed. */
export function getCreatorNamePillStyle(overrides?: Record<string, string | number | undefined>): Record<string, string | number> {
  return {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    boxShadow: '0 0 8px rgba(201,169,110,0.25)',
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
 * Inner photo diameter vs outer box for stacks using `/Icons/Profile icon.png`.
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
