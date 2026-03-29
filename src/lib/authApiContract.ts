/**
 * Client contract for auth JSON returned by server/routes/auth.ts
 * (handleLogin, handleRegister). Update here if those handlers change shape.
 */
import { z } from "zod";

/** Either snake_case or camelCase — server sends both; proxies must not strip both. */
const authSessionJsonSchema = z
  .object({
    access_token: z.string().min(1).optional(),
    accessToken: z.string().min(1).optional(),
  })
  .refine(
    (s) =>
      (typeof s.access_token === "string" && s.access_token.length > 0) ||
      (typeof s.accessToken === "string" && s.accessToken.length > 0),
    { message: "session.access_token or session.accessToken required" },
  );

const authUserJsonSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    // DB / JSON often uses null; z.string().optional() rejects null in Zod 4.
    email: z.string().nullish(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
    email_confirmed_at: z.string().nullish(),
    created_at: z.string().nullish(),
  })
  .passthrough();

const authLoginRegisterSuccessSchema = z.object({
  user: authUserJsonSchema,
  session: authSessionJsonSchema,
});

export type NormalizedAuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  email_confirmed_at?: string;
  created_at?: string;
  [key: string]: unknown;
};

/** Parse 200/201 login or register response body. Returns null if JSON does not match the server contract. */
export function parseAuthLoginRegisterResponse(data: unknown): {
  user: NormalizedAuthUser;
  accessToken: string;
} | null {
  const parsed = authLoginRegisterSuccessSchema.safeParse(data);
  if (!parsed.success) return null;
  const u = parsed.data.user;
  const sess = parsed.data.session;
  const accessToken = sess.access_token ?? sess.accessToken ?? "";
  return {
    user: { ...u, id: String(u.id) },
    accessToken,
  };
}
