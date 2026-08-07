/**
 * Server-gated test-coin ISSUE API.
 * Minting requires admin account + password verified on the server.
 * Password is never stored in localStorage / never hashed in the client bundle.
 */
import { request } from "./apiClient";
import { persistTestCoinsBalance } from "./testCoins";

export type TestCoinIssueResult =
  | { ok: true; balance: number; minted: number }
  | { ok: false; status: number; error: string };

export async function authorizeTestCoinIssue(password: string): Promise<TestCoinIssueResult> {
  const r = await request<{ ok?: boolean; error?: string }>("/api/test-coins/authorize", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (r.error || !r.data?.ok) {
    const msg = r.error?.message || (r.data as { error?: string } | null)?.error || "FORBIDDEN";
    const status = /too many/i.test(msg) ? 429 : /not authenticated|invalid/i.test(msg) ? 401 : 403;
    return { ok: false, status, error: msg };
  }
  return { ok: true, balance: 0, minted: 0 };
}

export async function mintTestCoinsViaServer(
  userId: string | undefined,
  password: string,
  amount: number,
): Promise<TestCoinIssueResult> {
  const r = await request<{
    balance?: number;
    minted?: number;
    origin?: string;
    error?: string;
  }>("/api/test-coins/mint", {
    method: "POST",
    body: JSON.stringify({ password, amount }),
  });
  if (r.error || typeof r.data?.balance !== "number") {
    const msg = r.error?.message || r.data?.error || "FORBIDDEN";
    const status = /too many/i.test(msg) ? 429 : /not authenticated|invalid/i.test(msg) ? 401 : 403;
    return { ok: false, status, error: msg };
  }
  const balance = Math.max(0, Math.floor(r.data.balance));
  const minted = Math.max(0, Math.floor(Number(r.data.minted) || amount));
  // Mirror server-issued balance into local TEST origin store for gift UI.
  persistTestCoinsBalance(userId, balance);
  return { ok: true, balance, minted };
}
