import { describe, expect, it } from "vitest";
import { verifyTotpCode } from "../routes/auth2fa";
import crypto from "node:crypto";

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

describe("TOTP verify (RFC6238 crypto)", () => {
  it("accepts a valid current code and rejects garbage", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const key = base32Decode(secret);
    const counter = Math.floor(Date.now() / 1000 / 30);
    const code = hotp(key, counter);
    expect(verifyTotpCode(secret, code)).toBe(true);
    expect(verifyTotpCode(secret, "000000")).toBe(false);
  });
});
