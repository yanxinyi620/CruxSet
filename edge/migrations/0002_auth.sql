ALTER TABLE admins ADD COLUMN email_normalized TEXT;
ALTER TABLE admins ADD COLUMN password_hash TEXT;
ALTER TABLE admins ADD COLUMN password_reset_required INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX admins_email_idx ON admins(email_normalized);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
