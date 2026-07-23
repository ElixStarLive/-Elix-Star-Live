import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), "utf8");

describe("Email verification contracts", () => {
  const auth = read("../routes/auth.ts");
  const router = read("../routes/auth.router.ts");
  const migration = read("../migrations/20260723140000_email_confirmation.sql");
  const guard = read("../middleware/sessionGuard.ts");
  const payout = read("../routes/payout.ts");
  const callback = read("../../src/pages/AuthCallback.tsx");

  it("migration adds email_confirmed_at and grandfathers existing accounts", () => {
    expect(migration).toContain("email_confirmed_at");
    expect(migration).toContain("SET email_confirmed_at = COALESCE(created_at, NOW())");
  });

  it("register requires confirmation when email is configured and does not issue a session", () => {
    expect(auth).toContain("needsEmailConfirmation: true");
    expect(auth).toContain("purpose: 'email_verify'");
    expect(auth).toContain("session: null");
  });

  it("login blocks unconfirmed accounts when email is configured", () => {
    expect(auth).toContain("Please confirm your email before logging in");
    expect(auth).toContain("!user.email_confirmed_at && isEmailConfigured()");
  });

  it("verify-email and resend-confirmation routes are wired", () => {
    expect(router).toContain('"/verify-email"');
    expect(router).toContain("handleVerifyEmail");
    expect(guard).toContain("/api/auth/verify-email");
    expect(auth).toContain("export async function handleVerifyEmail");
  });

  it("toAuthUser returns real confirmation state (not hardcoded now)", () => {
    expect(auth).toContain("email_confirmed_at: u.email_confirmed_at || ''");
    const toAuthStart = auth.indexOf("function toAuthUser");
    const toAuthEnd = auth.indexOf("function authSessionJson", toAuthStart);
    const toAuthBody = auth.slice(toAuthStart, toAuthEnd);
    expect(toAuthBody).not.toMatch(/email_confirmed_at:\s*new Date\(\)\.toISOString\(\)/);
  });

  it("AuthCallback redeems the verify token against the API", () => {
    expect(callback).toContain("/api/auth/verify-email");
    expect(callback).toContain("searchParams.get('token')");
  });

  it("payout withdraw requires confirmed email when mail is configured", () => {
    expect(payout).toContain("isEmailConfigured()");
    expect(payout).toContain("Please confirm your email before requesting a payout");
  });
});
