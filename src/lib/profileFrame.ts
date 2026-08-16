/** CSS px per mm (1in = 25.4mm, 1in = 96px). */
const CSS_PX_PER_MM = 96 / 25.4;

/**
 * Increase gold profile ring outer diameter by `mm` (avatar scales with inner ratio).
 */
export function profileRingOuterAddMm(baseOuterPx: number, mm: number): number {
  return Math.max(16, Math.round(baseOuterPx + mm * CSS_PX_PER_MM));
}

/** Extra outer diameter for live/spectator MVP rings vs previous 36 / 35 / 24px bases. */
const PROFILE_RING_SIZE_BUMP_MM = 3;

/** Live top-bar MVP avatars. */
export const LIVE_MVP_PROFILE_RING_PX = 28;

/**
 * Shared MVP #1 highlight — gold ring only (size/layout unchanged).
 * Use these class tokens wherever `isMvp` styles the circle/ring.
 */
export const MVP_GOLD = '#D9A62E';
/** Empty / letter MVP circle: gold border + glow. */
export const MVP_RING_EMPTY_CLASS =
  'border-[#D9A62E] shadow-[0_0_6px_0_rgba(217,166,46,0.55)]' as const;
/** Photo MVP circle wrapper (stage / battle rows). */
export const MVP_RING_PHOTO_CLASS =
  'rounded-full shadow-[0_0_6px_0_rgba(217,166,46,0.55)] ring-1 ring-[#D9A62E]' as const;
/** Compact top-bar / list MVP circle wrapper. */
export const MVP_RING_PHOTO_SOFT_CLASS =
  'rounded-full shadow-[0_0_3px_0_rgba(217,166,46,0.30)] ring-1 ring-[#D9A62E]' as const;
/** Tiny “MVP” pill on the circle — gold fill, same size/placement as before. */
export const MVP_BADGE_CLASS =
  'px-1 rounded-full bg-[#D9A62E] text-white text-[6px] font-black leading-none tracking-wide' as const;

/**
 * Battle bottom MVP strip — 6 circle slots total (3 per side), 3mm apart, never overlapping.
 * Host and spectator must use both of these so the strip stays 1-1.
 */
export const BATTLE_MVP_SLOTS_PER_SIDE = 3;
export const BATTLE_MVP_CIRCLE_GAP_CLASS = 'gap-[3mm]' as const;

/** Live chat message user avatar circle — app-wide standard for level badges. */
export const LEVEL_BADGE_RING_PX = 26;
export const CHAT_PROFILE_RING_PX = LEVEL_BADGE_RING_PX;

/** Spectator top bar MVP row. */
export const SPECTATOR_MVP_PROFILE_RING_PX = 28;

/** Battle video column height — 3mm shorter so chat does not cover MVP circles. */
export const LIVE_BATTLE_VIDEO_HEIGHT = 'calc(44dvh - 3mm)' as const;

/**
 * Bottom edge of battle cameras / top of MVP row.
 * Matches host/spectator battle stage + lower fundal.
 */
export const LIVE_BATTLE_STAGE_BOTTOM =
  'calc(var(--safe-top) + 112px - 2.5mm + 44dvh - 3mm)' as const;

/** Duet record/playback stage — battle height + 3cm taller. */
export const DUET_STAGE_HEIGHT = 'calc(44dvh - 3mm + 3cm)' as const;

/** Battle chat — 56px reserved under cameras for the MVP circle row. */
export const LIVE_BATTLE_CHAT_HEIGHT =
  'calc(56dvh - env(safe-area-inset-top, 0px) - 164px + 3.5mm - 56px - 4mm - max(2px, env(safe-area-inset-bottom, 0px)))' as const;

/** Keep chat below MVP rings (bottom anchor unchanged). */
export const LIVE_BATTLE_CHAT_SHIFT_Y = '0mm' as const;

/** Chat LV green pill — compact capsule beside the avatar circle (app-wide standard). */
export const LEVEL_BADGE_PILL_PX = 22;
export const CHAT_LEVEL_PILL_SIZE_PX = LEVEL_BADGE_PILL_PX;

/** Live bottom action row — sit on the writing/labels, safe-area inset only. */
export const LIVE_BOTTOM_ACTION_PADDING = 'max(2px, env(safe-area-inset-bottom, 0px))' as const;

/** Chat scroll area clears the bottom icon + label row. */
export const LIVE_BOTTOM_ACTION_RESERVE =
  'calc(52px + max(2px, env(safe-area-inset-bottom, 0px)))' as const;

/** Top edge of solo chat — gift cards sit here (above chat, not over messages). */
export const LIVE_SOLO_CHAT_TOP_FROM_BOTTOM =
  'calc(52px + max(2px, env(safe-area-inset-bottom, 0px)) + 25dvh + 2cm + 4mm)' as const;

/** Main host avatar in live top bar (next to name pill). */
export const LIVE_TOP_AVATAR_RING_PX = 48;

/** For You inline live: placeholder avatar was 96 px — +3 mm. */
export const INLINE_LIVE_PLACEHOLDER_AVATAR_PX = profileRingOuterAddMm(96, PROFILE_RING_SIZE_BUMP_MM);

/** Main profile page hero avatar (round photo under header). */
export const PROFILE_PAGE_AVATAR_PX = 96;
