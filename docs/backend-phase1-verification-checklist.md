# Backend Phase 1 Verification Checklist

Scope: Neon/Postgres as primary store for chat + shop items, no UI/layout changes.

## Pre-deploy

- Confirm `DATABASE_URL` points to production Neon.
- Apply `server/migrations/20260326_phase1_neon_primary.sql` in staging first.
- Confirm tables exist: `shop_items`, `chat_threads`, `messages`.
- Confirm indexes exist from migration script.

## Functional checks

- Create shop item via `POST /api/shop/items`; verify row in `shop_items`.
- List shop items via `GET /api/shop/items`; verify new item appears.
- Start Stripe shop checkout via `POST /api/shop/checkout`; verify item lookup resolves from DB.
- Complete Stripe checkout webhook; verify `shop_items.is_active=false` for purchased item.
- Ensure chat thread via `POST /api/chat/threads/ensure`; verify row in `chat_threads`.
- Send chat message via `POST /api/chat/threads/:threadId/messages`; verify row in `messages`.
- List thread/messages APIs return DB-backed data after server restart.
- Register/login via auth endpoints; verify records in `elix_auth_users`.
- Logout and validate session token hash is removed from `elix_auth_sessions`.
- Register/unregister push token; verify writes in `elix_device_tokens`.
- Send gift via `POST /api/gifts/send`; verify ledger debit and `elix_gift_transactions` row.
- Read wallet and transactions via `/api/wallet` and `/api/wallet/transactions`.

## Safety checks

- Verify wallet initialization no longer imports/depends on legacy `walletStore`.
- Verify no UI routes/components were modified.
- Check server logs for `db* failed` errors on chat/shop endpoints.

## Rollback

- Revert app deploy to previous server image/commit.
- If migration must be rolled back before usage, execute commented DROP statements in migration SQL.
- If production traffic has already written data, do not drop tables; rollback app only and preserve data.
