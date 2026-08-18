import { Router } from "express";
import { handleGetWallet } from "./wallet";
import { walletReadLimiter } from "../middleware/rateLimit";

const router = Router();
router.get("/", walletReadLimiter, handleGetWallet);
export default router;
