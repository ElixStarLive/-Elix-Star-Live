/**
 * Account creation.
 *
 * Everything a new account consists of — credentials, profile, starter balance
 * and its ledger entry, progression row — is written in one transaction. There
 * is no savepoint around the starter grant: if the balance cannot be created
 * the account must not exist either, because an account that silently opens
 * without the balance it was promised is a defect that only surfaces later, to
 * the person affected.
 */

import { withTransaction } from '../lib/postgres.js';
import { hashPassword } from './password.js';
import { usernameCandidates } from './username.js';
import { findAccountById, type AccountRow } from './users.repository.js';

/** Promotional, real monetary value £0. See migration 002. */
export const STARTER_COIN_GRANT = 50_000;

export type RegistrationResult =
  | { status: 'created'; account: AccountRow }
  | { status: 'email_taken' }
  | { status: 'username_taken' };

export interface ConsentRecord {
  type: string;
  version: string;
  ipAddress: string | null;
  userAgent: string;
}

interface RegistrationInput {
  email: string;
  password: string;
  /** Absent when the person did not choose one; a name is then derived. */
  username: string | undefined;
  /** True when the address must be proven before the account can sign in. */
  requireEmailConfirmation: boolean;
  /**
   * Written in the same transaction as the account. Recorded separately
   * afterwards, a failed second call would leave an account in existence with
   * no evidence that its terms were ever accepted.
   */
  consent: ConsentRecord;
}

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = '23505';

function violatedConstraint(err: unknown): string | null {
  const candidate = err as { code?: string; constraint?: string };
  return candidate.code === UNIQUE_VIOLATION ? (candidate.constraint ?? '') : null;
}

export async function registerAccount(input: RegistrationInput): Promise<RegistrationResult> {
  const passwordHash = await hashPassword(input.password);
  const confirmedAt = input.requireEmailConfirmation ? null : new Date();

  // A chosen name is used as given and its collision is reported. A derived one
  // is retried against alternatives, because the person never picked it and
  // should not be asked to resolve a clash they did not create.
  const chosen = input.username !== undefined;
  const candidates = chosen ? [input.username as string] : usernameCandidates(input.email);

  let lastUsernameClash = false;

  for (const username of candidates) {
    try {
      const userId = await withTransaction(async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO users (email, username, password_hash, email_confirmed_at)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [input.email, username, passwordHash, confirmedAt],
        );
        const id = inserted.rows[0]?.id;
        if (id === undefined) throw new Error('registration insert returned no id');

        await client.query(
          `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`,
          [id, username],
        );

        await client.query(
          `INSERT INTO starter_coin_balances (user_id, balance, lifetime_granted, lifetime_spent)
           VALUES ($1, $2, $2, 0)`,
          [id, STARTER_COIN_GRANT],
        );

        await client.query(
          `INSERT INTO starter_coin_transactions
             (user_id, kind, amount_delta, balance_after, idempotency_key, reason)
           VALUES ($1, 'onboarding_grant', $2, $2, $3, 'New account onboarding grant')`,
          [id, STARTER_COIN_GRANT, `starter:onboarding:${id}`],
        );

        await client.query(`INSERT INTO user_progression (user_id) VALUES ($1)`, [id]);

        await client.query(
          `INSERT INTO user_consents
             (user_id, consent_type, version, age_confirmed_13_plus, ip_address, user_agent)
           VALUES ($1, $2, $3, TRUE, $4, $5)`,
          [id, input.consent.type, input.consent.version, input.consent.ipAddress, input.consent.userAgent],
        );

        return id;
      });

      const account = await findAccountById(userId);
      if (!account) throw new Error('registered account could not be read back');
      return { status: 'created', account };
    } catch (err) {
      const constraint = violatedConstraint(err);
      if (constraint === null) throw err;

      // The email is unique regardless of which username was attempted, so a
      // clash on it is final and retrying cannot help.
      if (constraint.includes('email')) return { status: 'email_taken' };

      lastUsernameClash = true;
      if (chosen) return { status: 'username_taken' };
      // Otherwise fall through and try the next derived candidate.
    }
  }

  if (lastUsernameClash) return { status: 'username_taken' };
  throw new Error('registration produced no usable username candidate');
}
