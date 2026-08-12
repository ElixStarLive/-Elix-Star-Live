/**
 * Shared engagement Mission row shape (drawer + missions page).
 */

export type EngagementMissionRow = {
  id: string;
  scope: string;
  title: string;
  description: string;
  goal_count: number;
  reward_xp: number;
  reward_promo_coins: number;
  reward_energy: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
};
