import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { neonEnsureBalanceFromFile, neonGetCoinBalance, neonListLedger } from "../lib/walletNeon";
import { getPromoBalance } from "../lib/engagement";
import { getProgressionSnapshot } from "../lib/starterCoinsXp";

function requireAuth(req: Request, res: Response): { userId: string } | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return null;
  }
  return { userId: payload.sub };
}

export async function handleGetWallet(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = requireAuth(req, res);
  if (!auth) return;
  try {
    await neonEnsureBalanceFromFile(auth.userId);
    const [paid, promotional, progression] = await Promise.all([
      neonGetCoinBalance(auth.userId),
      getPromoBalance(auth.userId),
      getProgressionSnapshot(auth.userId),
    ]);
    const starter = Math.max(0, Number(progression?.starter_coin_balance ?? 0));
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      user_id: auth.userId,
      coin_balance: Math.max(0, Number(paid ?? 0)),
      starter_balance: starter,
      starter_coins: starter,
      promotional_balance: Math.max(0, Number(promotional ?? 0)),
      promotional_coins: Math.max(0, Number(promotional ?? 0)),
    });
  } catch {
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  }
}

export async function handleGetWalletTransactions(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = requireAuth(req, res);
  if (!auth) return;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  try {
    const transactions = await neonListLedger(auth.userId, limit);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ transactions });
  } catch {
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(503).json({ error: "DATABASE_UNAVAILABLE", transactions: null });
  }
}
