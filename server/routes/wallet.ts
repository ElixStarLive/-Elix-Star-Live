import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { neonEnsureBalanceFromFile, neonGetCoinBalance, neonListLedger } from "../lib/walletNeon";

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
  await neonEnsureBalanceFromFile(auth.userId);
  const balance = await neonGetCoinBalance(auth.userId);
  return res.status(200).json({
    user_id: auth.userId,
    coin_balance: Math.max(0, Number(balance ?? 0)),
  });
}

export async function handleGetWalletTransactions(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = requireAuth(req, res);
  if (!auth) return;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const transactions = await neonListLedger(auth.userId, limit);
  return res.status(200).json({ transactions });
}
