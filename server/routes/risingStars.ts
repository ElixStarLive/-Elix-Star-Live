/**
 * Rising Stars — public + creator HTTP handlers.
 */
import { Request, Response } from "express";
import { z } from "zod";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { assertRisingStarsVoteVelocityOk } from "../lib/fraud";
import { insertNotification } from "../lib/notifications";
import { logger } from "../lib/logger";
import {
  rsGetCurrentSeason,
  rsGetSeasonById,
  rsListCategories,
  rsListRegions,
  rsListChallenges,
  rsGetChallenge,
  rsListEntries,
  rsGetLeaderboard,
  rsEnterChallenge,
  rsWithdrawEntry,
  rsCastFreeVote,
  rsHasVotedToday,
  rsCreateTeam,
  rsJoinTeam,
  rsListTeams,
  rsListUserBadges,
  rsListRewardDefinitions,
  rsGetSeasonStandings,
  rsAttachLiveRoom,
} from "../lib/risingStarsNeon";

function optionalUserId(req: Request): string | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = verifyAuthToken(token);
  return payload?.sub || null;
}

export async function handleGetCurrentSeason(_req: Request, res: Response) {
  try {
    const season = await rsGetCurrentSeason();
    return res.json({ season });
  } catch (err) {
    logger.error({ err }, "rs current season failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}

export async function handleGetSeason(req: Request, res: Response) {
  try {
    const season = await rsGetSeasonById(String(req.params.id));
    if (!season) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ season });
  } catch (err) {
    logger.error({ err }, "rs get season failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}

export async function handleListCategories(req: Request, res: Response) {
  const seasonId = String(req.query.seasonId || "");
  if (!seasonId) return res.status(400).json({ error: "seasonId required" });
  try {
    const categories = await rsListCategories(seasonId);
    return res.json({ categories });
  } catch (err) {
    logger.error({ err }, "rs categories failed");
    return res.status(500).json({ error: "SERVER_ERROR", categories: [] });
  }
}

export async function handleListRegions(req: Request, res: Response) {
  const seasonId = String(req.query.seasonId || "");
  if (!seasonId) return res.status(400).json({ error: "seasonId required" });
  try {
    const regions = await rsListRegions(seasonId);
    return res.json({ regions });
  } catch (err) {
    logger.error({ err }, "rs regions failed");
    return res.status(500).json({ error: "SERVER_ERROR", regions: [] });
  }
}

export async function handleListChallenges(req: Request, res: Response) {
  const seasonId = String(req.query.seasonId || "");
  if (!seasonId) return res.status(400).json({ error: "seasonId required" });
  try {
    const challenges = await rsListChallenges({
      seasonId,
      categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
      regionId: req.query.regionId ? String(req.query.regionId) : undefined,
      week: req.query.week ? Number(req.query.week) : undefined,
    });
    return res.json({ challenges });
  } catch (err) {
    logger.error({ err }, "rs challenges failed");
    return res.status(500).json({ error: "SERVER_ERROR", challenges: [] });
  }
}

export async function handleGetChallenge(req: Request, res: Response) {
  try {
    const challenge = await rsGetChallenge(String(req.params.id));
    if (!challenge) return res.status(404).json({ error: "NOT_FOUND" });
    const userId = optionalUserId(req);
    const votedToday = userId
      ? await rsHasVotedToday(challenge.id, userId)
      : false;
    return res.json({ challenge, voted_today: votedToday });
  } catch (err) {
    logger.error({ err }, "rs get challenge failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}

export async function handleListEntries(req: Request, res: Response) {
  try {
    const entries = await rsListEntries(String(req.params.id));
    return res.json({ entries });
  } catch (err) {
    logger.error({ err }, "rs entries failed");
    return res.status(500).json({ error: "SERVER_ERROR", entries: [] });
  }
}

export async function handleGetLeaderboard(req: Request, res: Response) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const rankings = await rsGetLeaderboard(String(req.params.id), limit);
    return res.json({ rankings });
  } catch (err) {
    logger.error({ err }, "rs leaderboard failed");
    return res.status(500).json({ error: "SERVER_ERROR", rankings: [] });
  }
}

export async function handleGetSeasonStandings(req: Request, res: Response) {
  try {
    const standings = await rsGetSeasonStandings(String(req.params.id));
    return res.json({ standings });
  } catch (err) {
    logger.error({ err }, "rs standings failed");
    return res.status(500).json({ error: "SERVER_ERROR", standings: [] });
  }
}

export async function handleListTeams(req: Request, res: Response) {
  const seasonId = String(req.query.seasonId || "");
  if (!seasonId) return res.status(400).json({ error: "seasonId required" });
  try {
    const teams = await rsListTeams(
      seasonId,
      req.query.regionId ? String(req.query.regionId) : undefined,
    );
    return res.json({ teams });
  } catch (err) {
    logger.error({ err }, "rs teams failed");
    return res.status(500).json({ error: "SERVER_ERROR", teams: [] });
  }
}

export async function handleListRewards(req: Request, res: Response) {
  const seasonId = String(req.query.seasonId || "");
  if (!seasonId) return res.status(400).json({ error: "seasonId required" });
  try {
    const rewards = await rsListRewardDefinitions(seasonId);
    return res.json({ rewards });
  } catch (err) {
    logger.error({ err }, "rs rewards failed");
    return res.status(500).json({ error: "SERVER_ERROR", rewards: [] });
  }
}

export async function handleMyBadges(req: Request, res: Response) {
  const userId = req.auth?.sub;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const badges = await rsListUserBadges(userId);
    return res.json({ badges });
  } catch (err) {
    logger.error({ err }, "rs badges failed");
    return res.status(500).json({ error: "SERVER_ERROR", badges: [] });
  }
}

export async function handleUserBadges(req: Request, res: Response) {
  try {
    const badges = await rsListUserBadges(String(req.params.userId));
    return res.json({ badges });
  } catch (err) {
    logger.error({ err }, "rs user badges failed");
    return res.status(500).json({ error: "SERVER_ERROR", badges: [] });
  }
}

const enterSchema = z.object({
  videoId: z.string().min(1),
  teamId: z.string().uuid().optional().nullable(),
});

export async function handleEnterChallenge(req: Request, res: Response) {
  const userId = req.auth?.sub;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const parsed = enterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await rsEnterChallenge({
      challengeId: String(req.params.id),
      creatorUserId: userId,
      videoId: parsed.data.videoId,
      teamId: parsed.data.teamId,
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.code });
    }
    await insertNotification({
      userId,
      type: "rising_stars_entry",
      title: "Rising Stars entry accepted",
      body: "Your video is now in the competition.",
      actionUrl: `/rising-stars/challenge/${req.params.id}`,
      data: { path: `/rising-stars/challenge/${req.params.id}` },
    });
    return res.status(201).json({ entry: result.entry });
  } catch (err) {
    logger.error({ err }, "rs enter failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}

export async function handleWithdrawEntry(req: Request, res: Response) {
  const userId = req.auth?.sub;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const result = await rsWithdrawEntry(String(req.params.id), userId);
    if (!result.ok) return res.status(result.status).json({ error: result.code });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "rs withdraw failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}

export async function handleVote(req: Request, res: Response) {
  const userId = req.auth?.sub;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const velocity = await assertRisingStarsVoteVelocityOk(userId);
  if (!velocity.ok) {
    return res.status(429).json({ error: velocity.code });
  }
  try {
    const result = await rsCastFreeVote({
      entryId: String(req.params.id),
      voterUserId: userId,
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.code });
    }
    return res.json({
      ok: true,
      entry_id: result.entry_id,
      challenge_id: result.challenge_id,
      vote_count: result.vote_count,
    });
  } catch (err) {
    logger.error({ err }, "rs vote failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}

const teamSchema = z.object({
  seasonId: z.string().uuid(),
  regionId: z.string().uuid().optional().nullable(),
  name: z.string().min(2).max(60),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
});

export async function handleCreateTeam(req: Request, res: Response) {
  const userId = req.auth?.sub;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const parsed = teamSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }
  try {
    const team = await rsCreateTeam({
      season_id: parsed.data.seasonId,
      region_id: parsed.data.regionId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      captain_user_id: userId,
    });
    if (!team) return res.status(409).json({ error: "TEAM_CREATE_FAILED" });
    return res.status(201).json({ team });
  } catch (err) {
    logger.error({ err }, "rs create team failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}

export async function handleJoinTeam(req: Request, res: Response) {
  const userId = req.auth?.sub;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const result = await rsJoinTeam(String(req.params.id), userId);
    if (!result.ok) return res.status(result.status).json({ error: result.code });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "rs join team failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}

export async function handleGetChallengeLive(req: Request, res: Response) {
  try {
    const challenge = await rsGetChallenge(String(req.params.id));
    if (!challenge) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({
      live: {
        qualifier_room_id: challenge.live_qualifier_room_id,
        final_room_id: challenge.live_final_room_id,
        status: challenge.status,
      },
    });
  } catch (err) {
    logger.error({ err }, "rs live info failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}

/** Creator/host can attach their own live room to a challenge stage they are hosting. */
export async function handleAttachOwnLive(req: Request, res: Response) {
  const userId = req.auth?.sub;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const schema = z.object({
    phase: z.enum(["qualifier", "final"]),
    roomId: z.string().min(1).max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body" });
  }
  // Only allow attaching a room that matches the authenticated host's stream key convention.
  // Live stream ownership is enforced elsewhere; here we require roomId to include userId.
  if (!parsed.data.roomId.includes(userId)) {
    return res.status(403).json({ error: "ROOM_NOT_OWNED" });
  }
  try {
    const challenge = await rsAttachLiveRoom(
      String(req.params.id),
      parsed.data.phase,
      parsed.data.roomId,
    );
    if (!challenge) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ challenge });
  } catch (err) {
    logger.error({ err }, "rs attach live failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}
