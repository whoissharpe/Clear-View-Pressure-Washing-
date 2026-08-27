-- Clear View - lead storage for the quote form.
-- Apply with:  npx wrangler d1 execute clearview-leads --remote --file=./schema.sql
CREATE TABLE IF NOT EXISTS leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT    NOT NULL,          -- ISO 8601, UTC
  name       TEXT    NOT NULL,
  phone      TEXT    NOT NULL,
  address    TEXT    NOT NULL DEFAULT '',
  service    TEXT    NOT NULL DEFAULT '',
  message    TEXT    NOT NULL,
  source     TEXT    NOT NULL DEFAULT '',  -- page the form was submitted from
  ip         TEXT    NOT NULL DEFAULT '',
  handled    INTEGER NOT NULL DEFAULT 0
);

-- The admin page lists newest first; this keeps that a single index scan.
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
