import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  risingStarsEnterLimiter,
  risingStarsVoteLimiter,
} from "../middleware/rateLimit";
import {
  handleGetCurrentSeason,
  handleGetSeason,
  handleListCategories,
  handleListRegions,
  handleListChallenges,
  handleGetChallenge,
  handleListEntries,
  handleGetLeaderboard,
  handleGetSeasonStandings,
  handleListTeams,
  handleListRewards,
  handleMyBadges,
  handleUserBadges,
  handleEnterChallenge,
  handleWithdrawEntry,
  handleVote,
  handleCreateTeam,
  handleJoinTeam,
  handleGetChallengeLive,
  handleAttachOwnLive,
} from "./risingStars";

const router = Router();

router.get("/seasons/current", handleGetCurrentSeason);
router.get("/seasons/:id", handleGetSeason);
router.get("/seasons/:id/standings", handleGetSeasonStandings);
router.get("/categories", handleListCategories);
router.get("/regions", handleListRegions);
router.get("/challenges", handleListChallenges);
router.get("/challenges/:id", handleGetChallenge);
router.get("/challenges/:id/entries", handleListEntries);
router.get("/challenges/:id/leaderboard", handleGetLeaderboard);
router.get("/challenges/:id/live", handleGetChallengeLive);
router.get("/teams", handleListTeams);
router.get("/rewards", handleListRewards);
router.get("/badges/me", requireAuth, handleMyBadges);
router.get("/badges/user/:userId", handleUserBadges);

router.post(
  "/challenges/:id/enter",
  requireAuth,
  risingStarsEnterLimiter,
  handleEnterChallenge,
);
router.delete("/entries/:id", requireAuth, handleWithdrawEntry);
router.post(
  "/entries/:id/vote",
  requireAuth,
  risingStarsVoteLimiter,
  handleVote,
);
router.post("/teams", requireAuth, handleCreateTeam);
router.post("/teams/:id/join", requireAuth, handleJoinTeam);
router.post("/challenges/:id/live/attach", requireAuth, handleAttachOwnLive);

export default router;
