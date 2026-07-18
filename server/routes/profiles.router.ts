import { Router } from "express";
import {
  handleGetProfile, handleListProfiles, handleGetProfileByUsername,
  handleGetFollowers, handleGetFollowing, handlePatchProfile,
  handleFollow, handleUnfollow, handleSeedProfile,
} from "./profiles";
import { validateBody } from "../middleware/validate";
import { profilePatchSchema } from "../validation/schemas";

const router = Router();
router.get("/by-username/:username", handleGetProfileByUsername);
router.get("/", handleListProfiles);
router.get("/:userId", handleGetProfile);
router.get("/:userId/followers", handleGetFollowers);
router.get("/:userId/following", handleGetFollowing);
router.patch("/:userId", validateBody(profilePatchSchema), handlePatchProfile);
router.post("/:userId/follow", handleFollow);
router.post("/:userId/unfollow", handleUnfollow);
router.post("/", handleSeedProfile);
export default router;
