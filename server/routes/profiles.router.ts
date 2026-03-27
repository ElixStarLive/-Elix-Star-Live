import { Router } from "express";
import {
  handleGetProfile, handleListProfiles, handleGetProfileByUsername,
  handleGetFollowers, handleGetFollowing, handlePatchProfile,
  handleFollow, handleUnfollow, handleSeedProfile,
} from "./profiles";

const router = Router();
router.get("/by-username/:username", handleGetProfileByUsername);
router.get("/", handleListProfiles);
router.get("/:userId", handleGetProfile);
router.get("/:userId/followers", handleGetFollowers);
router.get("/:userId/following", handleGetFollowing);
router.patch("/:userId", handlePatchProfile);
router.post("/:userId/follow", handleFollow);
router.post("/:userId/unfollow", handleUnfollow);
router.post("/", handleSeedProfile);
export default router;
