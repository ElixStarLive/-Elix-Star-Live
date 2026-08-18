/**
 * Server-gated test-coin ISSUE API.
 * Minting requires login + password verified on the server.
 * Password is never stored in localStorage / never hashed in the client bundle.
 */
import { request } from "./apiClient";
import { persistTestCoinsBalance } from "./testCoins";

export type TestCoinIssueResult =
  | { ok: true; balance: number; minted: number }
  | { ok: false; status: number; error: string };

/** Never show leftover admin-role copy. Only FORBIDDEN means the password was wrong. */
export function formatTestCoinIssueError(error: string, status: number): string {
  if (status === 401 || /not authenticated|invalid/i.test(error)) return "Sign in required";
  if (status === 429 || /too many/i.test(error)) return "Too many attempts. Try again later.";
  if (error === "FORBIDDEN") return "Wrong password";
  if (/not configured/i.test(error)) return "Server password not set";
  return error;
}

/**
 * The shared response reader loses the HTTP status, so the server's message is
 * the only signal. A store or lockout that could not answer must not be read as
 * a wrong password — that would send the owner back to retype a correct one.
 */
function inferTestCoinIssueStatus(message: string): number {
  if (/too many/i.test(message)) return 429;
  if (/not authenticated|invalid or expired/i.test(message)) return 401;
  if (/unavailable|not configured/i.test(message)) return 503;
  return 403;
}

export async function authorizeTestCoinIssue(password: string): Promise<TestCoinIssueResult> {
  const r = await request<{ ok?: boolean; error?: string }>("/api/test-coins/authorize", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (r.error || !r.data?.ok) {
    const msg = r.error?.message || (r.data as { error?: string } | null)?.error || "FORBIDDEN";
    return { ok: false, status: inferTestCoinIssueStatus(msg), error: msg };
  }
  return { ok: true, balance: 0, minted: 0 };
}

/**
 * Read the SERVER test balance and refresh the display mirror.
 * The server is the only place a test balance exists; this keeps the panel
 * showing the real number after a reinstall, a new device, or a spend.
 */
export async function refreshTestCoinsBalance(
  userId: string | undefined,
): Promise<number | null> {
  const r = await request<{ balance?: number }>("/api/test-coins/balance");
  if (r.error || typeof r.data?.balance !== "number") return null;
  const balance = Math.max(0, Math.floor(r.data.balance));
  persistTestCoinsBalance(userId, balance);
  return balance;
}

/**
 * Identity of one mint attempt. The server credits a given id once, so a
 * retried or replayed request cannot mint twice, while a new press is a new
 * attempt and mints again.
 */
function newMintRequestId(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2);
  return `m${Date.now().toString(36)}${rand}`.slice(0, 64);
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
    body: JSON.stringify({ password, amount, requestId: newMintRequestId() }),
  });
  if (r.error || typeof r.data?.balance !== "number") {
    // No local mint fallback: a refused mint must fail visibly. The balance
    // lives on the server, so a client-side credit would be a lie.
    const msg = r.error?.message || r.data?.error || "FORBIDDEN";
    return { ok: false, status: inferTestCoinIssueStatus(msg), error: msg };
  }
  const balance = Math.max(0, Math.floor(r.data.balance));
  // The server says what it minted. A replayed request answers minted: 0, and
  // reporting the requested amount there would claim coins nobody credited.
  const minted =
    typeof r.data.minted === "number"
      ? Math.max(0, Math.floor(r.data.minted))
      : Math.max(0, Math.floor(amount));
  persistTestCoinsBalance(userId, balance);
  return { ok: true, balance, minted };
}
