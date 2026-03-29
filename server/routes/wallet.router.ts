import { Router } from "express";
import { handleGetWallet, handleGetWalletTransactions } from "./wallet";
import { walletReadLimiter } from "../middleware/rateLimit";

const router = Router();
router.get("/", walletReadLimiter, handleGetWallet);
router.get("/transactions", walletReadLimiter, handleGetWalletTransactions);
export default router;
