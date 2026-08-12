/**
 * Shared host↔spectator battle score visibility flags.
 */

export function computeBattleFinalSecondsHide(
  isBattleActive: boolean,
  battleTimeSeconds: number,
  hasWinner: boolean,
): boolean {
  return isBattleActive && battleTimeSeconds > 0 && battleTimeSeconds <= 10 && !hasWinner;
}

export function computeMistHidesScoresForViewer(
  mistFog: { supportedUserId: string; expiresAt: number } | null | undefined,
  viewerUserId: string | undefined | null,
): boolean {
  return (
    !!mistFog &&
    mistFog.expiresAt > Date.now() &&
    String(mistFog.supportedUserId) !== String(viewerUserId || '')
  );
}
