/**
 * Client contract for auth JSON returned by server/routes/auth.ts
 * (handleLogin, handleRegister). Update here if those handlers change shape.
 */
import { z } from "zod";

const authSessionJsonSchema = z.object({
  access_token: z.string().min(1),
  accessToken: z.string().min(1).optional(),
});

const authUserJsonSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    email: z.string().optional(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
    email_confirmed_at: z.string().optional(),
    created_at: z.string().optional(),
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
  return {
    user: { ...u, id: String(u.id) },
    accessToken: parsed.data.session.access_token,
  };
}
