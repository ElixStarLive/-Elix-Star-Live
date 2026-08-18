import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Apple money authority.
 *
 * Two things used to be wrong here and both cost real money:
 *
 * 1. Every non-2xx App Store Server API answer became `valid: false`, which the
 *    coin route reported as "Invalid receipt". Missing credentials, a throttle or
 *    an Apple 5xx are our outage, not a rejected purchase, and a charged customer
 *    was told their receipt was bad.
 * 2. Nothing checked which Apple environment the transaction came from. The API
 *    helper falls back to the sandbox host on 404 (Apple's documented order), so a
 *    TestFlight/sandbox transaction verified fine on the production server and
 *    minted real paid coins plus a real GBP lot for money Apple never took.
 *
 * The signature check itself is deliberately unforgeable: the chain must end at
 * Apple Root CA - G3. These tests therefore use the real published Apple root as
 * the x5c entry (its validity window covers 2014-2039 and its own fingerprint
 * satisfies the terminator check) and stub only `jose.jwtVerify` — the one step
 * that needs Apple's private key.
 */

/** Apple Root CA - G3, DER base64 (public Apple PKI) — same cert the verifier pins. */
const APPLE_ROOT_CA_G3_DER_B64 = [
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS",
  "QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u",
  "IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN",
  "MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS",
  "b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y",
  "aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49",
  "AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf",
  "TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517",
  "IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr",
  "MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA",
  "MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4",
  "at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM",
  "6BgD56KyKA==",
].join("");

const jwtVerify = vi.fn();

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return { ...actual, jwtVerify: (...args: unknown[]) => jwtVerify(...args) };
});

function signedTransaction(payload: Record<string, unknown>): string {
  const b64 = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    b64({ alg: "ES256", x5c: [APPLE_ROOT_CA_G3_DER_B64] }),
    b64(payload),
    "signature-checked-by-jose",
  ].join(".");
}

function appleTransactionPayload(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "2000000111111111",
    originalTransactionId: "2000000111111111",
    productId: "coins500",
    bundleId: "com.elixstarlive.app",
    environment: "Production",
    purchaseDate: Date.now(),
    appAccountToken: "4f1d5c7a-0000-5000-8000-0000000000aa",
    ...overrides,
  };
}

const fetchMock = vi.fn();
const savedEnv = { ...process.env };

beforeEach(() => {
  jwtVerify.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  process.env.APPLE_ISSUER_ID = "issuer-1";
  process.env.APPLE_KEY_ID = "key-1";
  process.env.APPLE_PRIVATE_KEY = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  process.env.APPLE_BUNDLE_ID = "com.elixstarlive.app";
  delete process.env.APPLE_IAP_ENVIRONMENT;
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...savedEnv };
});

function appleReplies(payload: Record<string, unknown>) {
  const signed = signedTransaction(payload);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ signedTransactionInfo: signed }),
  });
  jwtVerify.mockResolvedValue({ payload });
}

describe("Apple transaction lookup — no verdict is not a rejection", () => {
  it("reports unavailable, not invalid, when Apple credentials are missing", async () => {
    delete process.env.APPLE_PRIVATE_KEY;
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid).toBe(false);
    expect(result.valid === false && result.reason).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports unavailable when the App Store Server API returns 500", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid === false && result.reason).toBe("unavailable");
  });

  it("reports unavailable when the App Store Server API throttles us", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "slow down" });
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid === false && result.reason).toBe("unavailable");
  });

  it("reports unavailable when our own Apple credentials are refused", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "bad jwt" });
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid === false && result.reason).toBe("unavailable");
  });

  it("reports unavailable when the request times out", async () => {
    fetchMock.mockRejectedValue(new Error("The operation was aborted due to timeout"));
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid === false && result.reason).toBe("unavailable");
  });

  it("reports invalid when Apple knows the transaction in neither environment", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"errorCode":4040010}',
    });
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid === false && result.reason).toBe("invalid");
    // Production first, then sandbox — Apple's documented lookup order.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports invalid when the signed transaction is not signed by Apple", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ signedTransactionInfo: "not.a.jws" }),
    });
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid === false && result.reason).toBe("invalid");
    expect(result.valid === false && result.detail).toBe("apple-jws-missing-or-malformed");
  });
});

describe("Apple JWS signature verification", () => {
  /**
   * The leaf certificate's `publicKey` was passed through Node's
   * `createPublicKey()`, which only accepts a *private* KeyObject. That threw
   * ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE for every Apple JWS, so signature
   * verification never ran and every iOS purchase failed as a malformed receipt.
   */
  it("hands Apple's leaf certificate key straight to the signature check", async () => {
    appleReplies(appleTransactionPayload());
    const { fetchAppleTransaction } = await import("./appleIap");

    await fetchAppleTransaction("2000000111111111");

    expect(jwtVerify).toHaveBeenCalledTimes(1);
    const key = jwtVerify.mock.calls[0][1] as { asymmetricKeyType?: string; type?: string };
    expect(key.type).toBe("public");
    expect(key.asymmetricKeyType).toBe("ec");
    expect(jwtVerify.mock.calls[0][2]).toEqual({ algorithms: ["ES256"] });
  });

  it("rejects a payload with no certificate chain", async () => {
    const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          signedTransactionInfo: [b64({ alg: "ES256" }), b64(appleTransactionPayload()), "sig"].join("."),
        }),
    });
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid).toBe(false);
    expect(jwtVerify).not.toHaveBeenCalled();
  });
});

describe("Apple transaction identity — right app, right environment", () => {
  it("accepts a production transaction for this app", async () => {
    appleReplies(appleTransactionPayload());
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid).toBe(true);
    expect(result.valid === true && result.productId).toBe("coins500");
  });

  it("refuses a sandbox transaction on a production server", async () => {
    appleReplies(appleTransactionPayload({ environment: "Sandbox" }));
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid).toBe(false);
    expect(result.valid === false && result.detail).toBe(
      "apple-transaction-environment-mismatch",
    );
  });

  it("accepts a sandbox transaction only when the server declares Sandbox", async () => {
    process.env.APPLE_IAP_ENVIRONMENT = "Sandbox";
    appleReplies(appleTransactionPayload({ environment: "Sandbox" }));
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid).toBe(true);
  });

  it("refuses a production transaction on a sandbox server", async () => {
    process.env.APPLE_IAP_ENVIRONMENT = "Sandbox";
    appleReplies(appleTransactionPayload({ environment: "Production" }));
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid === false && result.detail).toBe(
      "apple-transaction-environment-mismatch",
    );
  });

  it("refuses a valid Apple transaction that belongs to another app", async () => {
    appleReplies(appleTransactionPayload({ bundleId: "com.someoneelse.app" }));
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid === false && result.detail).toBe(
      "apple-transaction-bundle-mismatch",
    );
  });

  it("refuses evidence that simply omits the bundle id", async () => {
    const payload = appleTransactionPayload();
    delete (payload as Record<string, unknown>).bundleId;
    appleReplies(payload);
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid === false && result.detail).toBe(
      "apple-transaction-missing-bundle-id",
    );
  });

  it("refuses evidence that simply omits the environment", async () => {
    const payload = appleTransactionPayload();
    delete (payload as Record<string, unknown>).environment;
    appleReplies(payload);
    const { fetchAppleTransaction } = await import("./appleIap");

    const result = await fetchAppleTransaction("2000000111111111");

    expect(result.valid === false && result.detail).toBe(
      "apple-transaction-missing-environment",
    );
  });
});

describe("appleTransactionIdentityError", () => {
  it("passes only on an exact app and environment match", async () => {
    const { appleTransactionIdentityError } = await import("./appleIap");

    expect(appleTransactionIdentityError(appleTransactionPayload())).toBeNull();
    expect(appleTransactionIdentityError(null)).toBe("apple-transaction-missing");
    expect(
      appleTransactionIdentityError(appleTransactionPayload({ environment: "Sandbox" })),
    ).toBe("apple-transaction-environment-mismatch");
    expect(
      appleTransactionIdentityError(appleTransactionPayload({ bundleId: " " })),
    ).toBe("apple-transaction-missing-bundle-id");
  });

  it("treats Apple's environment casing as the same environment", async () => {
    const { appleTransactionIdentityError } = await import("./appleIap");

    expect(
      appleTransactionIdentityError(appleTransactionPayload({ environment: "PRODUCTION" })),
    ).toBeNull();
  });
});

describe("Apple subscription verification", () => {
  it("passes the unavailable reason through so callers can offer a retry", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => "down" });
    const { verifyAppleSubscription } = await import("./appleIap");

    const result = await verifyAppleSubscription("2000000111111111", "com.elixstarlive.membership");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("unavailable");
  });

  it("marks a wrong-product subscription invalid, not unavailable", async () => {
    appleReplies(
      appleTransactionPayload({
        productId: "com.elixstarlive.other",
        expiresDate: Date.now() + 86_400_000,
      }),
    );
    const { verifyAppleSubscription } = await import("./appleIap");

    const result = await verifyAppleSubscription("2000000111111111", "com.elixstarlive.membership");

    expect(result.ok === false && result.reason).toBe("invalid");
    expect(result.ok === false && result.error).toBe("product_mismatch");
  });

  it("refuses a revoked subscription", async () => {
    appleReplies(
      appleTransactionPayload({
        productId: "com.elixstarlive.membership",
        expiresDate: Date.now() + 86_400_000,
        revocationDate: Date.now() - 1_000,
      }),
    );
    const { verifyAppleSubscription } = await import("./appleIap");

    const result = await verifyAppleSubscription("2000000111111111", "com.elixstarlive.membership");

    expect(result.entitled).toBe(false);
  });
});
