import { Router } from "express";
import { handleGetWallet, handleGetWalletTransactions } from "./wallet";

const router = Router();
router.get("/", handleGetWallet);
router.get("/transactions", handleGetWalletTransactions);
export default router;
