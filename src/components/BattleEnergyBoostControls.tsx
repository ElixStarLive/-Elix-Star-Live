import { engagementFlags } from "../config/engagementFlags";
import { apiEngagementBattleEnergyEarn } from "../features/live/engagement/liveEngagementApi";
import { crashReporting } from "../lib/crashReporting";

/** Fire-and-forget capped energy earn (watch/comment/share). No-op when flag off. */
export function earnBattleEnergyQuiet(
  source: "watch" | "comment" | "share",
  roomId?: string,
): void {
  if (!engagementFlags.battleEnergyEnabled) return;
  void apiEngagementBattleEnergyEarn({ source, roomId }).catch((err) => {
    const error = err instanceof Error ? err : new Error(String(err || "battle_energy_earn_failed"));
    void crashReporting.logError(error, { source: "earnBattleEnergyQuiet", earnSource: source });
  });
}
