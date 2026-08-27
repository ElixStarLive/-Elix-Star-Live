/**
 * The only place `users` and `profiles` rows are read for authentication.
 *
 * Keeping the SQL here means the join between the two tables is written once,
 * and no route can invent a slightly different notion of "the signed-in user".
 */

import { query } from '../lib/postgres.js';

export interface AccountRow {
  id: string;
  email: string;
  username: string;
  passwordHash: string | null;
  emailConfirmedAt: Date | null;
  createdAt: Date;
  displayName: string;
  avatarUrl: string;
  isAdmin: boolean;
  isVerified: boolean;
  bannedUntil: Date | null;
}

interface RawAccount {
  id: string;
  email: string;
  username: string;
  password_hash: string | null;
  email_confirmed_at: Date | null;
  created_at: Date;
  display_name: string;
  avatar_url: string;
  is_admin: boolean;
  is_verified: boolean;
  banned_until: Date | null;
}

const SELECT_ACCOUNT = `
  SELECT u.id,
         u.email::text        AS email,
         u.username::text     AS username,
         u.password_hash,
         u.email_confirmed_at,
         u.created_at,
         p.display_name,
         p.avatar_url,
         p.is_admin,
         p.is_verified,
         p.banned_until
    FROM users u
    JOIN profiles p ON p.user_id = u.id
`;

function toAccount(row: RawAccount): AccountRow {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash,
    emailConfirmedAt: row.email_confirmed_at,
    createdAt: row.created_at,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isAdmin: row.is_admin,
    isVerified: row.is_verified,
    bannedUntil: row.banned_until,
  };
}

/**
 * Login accepts either an email address or a username in one field, so the
 * lookup has to consider both. Both columns are `citext`, which makes the
 * comparison case-insensitive without a function call that would defeat the
 * unique indexes.
 */
export async function findAccountByIdentifier(identifier: string): Promise<AccountRow | null> {
  const { rows } = await query<RawAccount>(
    `${SELECT_ACCOUNT} WHERE u.email = $1 OR u.username = $1 LIMIT 1`,
    [identifier],
  );
  const row = rows[0];
  return row ? toAccount(row) : null;
}

export async function findAccountByEmail(email: string): Promise<AccountRow | null> {
  const { rows } = await query<RawAccount>(
    `${SELECT_ACCOUNT} WHERE u.email = $1::citext LIMIT 1`,
    [email],
  );
  const row = rows[0];
  return row ? toAccount(row) : null;
}

export async function findAccountById(userId: string): Promise<AccountRow | null> {
  const { rows } = await query<RawAccount>(`${SELECT_ACCOUNT} WHERE u.id = $1 LIMIT 1`, [userId]);
  const row = rows[0];
  return row ? toAccount(row) : null;
}

export async function confirmUserEmail(userId: string): Promise<string | null> {
  const { rows } = await query<{ email_confirmed_at: Date }>(
    `UPDATE users
        SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
      WHERE id = $1
      RETURNING email_confirmed_at`,
    [userId],
  );
  const row = rows[0];
  return row ? row.email_confirmed_at.toISOString() : null;
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
}

export function isSuspended(account: AccountRow, now: Date = new Date()): boolean {
  return account.bannedUntil !== null && account.bannedUntil.getTime() > now.getTime();
}
