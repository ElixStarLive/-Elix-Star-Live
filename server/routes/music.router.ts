import { Router } from "express";
import {
  handleMusicCollections,
  handleMusicPlaylists,
  handleMusicSearch,
  handleMusicStatus,
  handleMusicTrackPreview,
} from "./music";
import { rateLimit } from "../middleware/rateLimit";

const musicSearchLimiter = rateLimit({ windowMs: 60_000, max: 60, keyPrefix: "music_search" });
const musicPreviewLimiter = rateLimit({ windowMs: 60_000, max: 120, keyPrefix: "music_preview" });

const router = Router();

router.get("/status", handleMusicStatus);
router.get("/playlists", musicSearchLimiter, handleMusicPlaylists);
router.get("/collections", musicSearchLimiter, handleMusicCollections);
router.get("/search", musicSearchLimiter, handleMusicSearch);
router.get("/tracks/:trackId/preview", musicPreviewLimiter, handleMusicTrackPreview);

export default router;
