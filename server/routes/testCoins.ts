import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";

const testBalances = new Map<string, number>();

export function handleGetTestCoinBalance(req: Request, res: Response): void {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }
  const balance = testBalances.get(payload.sub) || 0;
  res.json({ balance, userId: payload.sub });
}

export function handleMintTestCoins(req: Request, res: Response): void {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }
  const amount = Math.max(0, Math.min(Number(req.body?.amount) || 1000, 100_000));
  const current = testBalances.get(payload.sub) || 0;
  const newBalance = current + amount;
  testBalances.set(payload.sub, newBalance);
  res.json({ balance: newBalance, minted: amount });
}

export function handleSpendTestCoinsForScore(req: Request, res: Response): void {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }
  const amount = Math.max(0, Number(req.body?.amount) || 0);
  const current = testBalances.get(payload.sub) || 0;
  if (amount > current) {
    res.status(400).json({ error: "Insufficient test coins.", balance: current });
    return;
  }
  const newBalance = current - amount;
  testBalances.set(payload.sub, newBalance);
  res.json({ balance: newBalance, spent: amount });
}
