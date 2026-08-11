-- Auth display_name previously patched at request time; require migration.
ALTER TABLE elix_auth_users
  ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE elix_auth_users
   SET display_name = COALESCE(NULLIF(display_name, ''), username)
 WHERE display_name IS NULL OR display_name = '';
