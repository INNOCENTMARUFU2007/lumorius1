-- ============================================================
-- Lumorius AI — Additional Tables & Schema Corrections
-- Patch 002: missing tables discovered during code audit
-- ============================================================

-- ── FIX: notifications table column names ───────────────────
-- The initial schema used body/metadata/is_read; the service
-- expects message/data/read_at (is_read not needed).

ALTER TABLE notifications RENAME COLUMN body     TO message;
ALTER TABLE notifications RENAME COLUMN metadata TO data;
ALTER TABLE notifications DROP COLUMN IF EXISTS is_read;

-- Convert notification_type enum column → plain TEXT
ALTER TABLE notifications ALTER COLUMN type DROP DEFAULT;
ALTER TABLE notifications ALTER COLUMN type TYPE TEXT USING type::TEXT;
ALTER TABLE notifications ALTER COLUMN type SET DEFAULT 'system';

-- ── PROJECTS ─────────────────────────────────────────────────
-- Referenced by tasks.service.ts (project_id FK + SELECT)

CREATE TABLE IF NOT EXISTS projects (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id         UUID,
  name            TEXT        NOT NULL,
  description     TEXT,
  status          TEXT        NOT NULL DEFAULT 'active',
  start_date      DATE,
  end_date        DATE,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner  ON projects(owner_id);

-- ── TASKS: add team_id column ────────────────────────────────
-- tasks.service.ts inserts team_id but it wasn't in schema 001

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_id UUID;

-- ── MEETING TRANSCRIPTS ───────────────────────────────────────
-- meetings.processor.ts inserts into this table after Whisper

CREATE TABLE IF NOT EXISTS meeting_transcripts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  UUID        NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  segments    JSONB       NOT NULL DEFAULT '[]',
  language    TEXT        NOT NULL DEFAULT 'en',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mt_meeting_id ON meeting_transcripts(meeting_id);

-- ── MEETING ANALYSES ─────────────────────────────────────────
-- meetings.processor.ts inserts AI analysis after transcription

CREATE TABLE IF NOT EXISTS meeting_analyses (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        UUID        NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  summary           TEXT,
  action_items      JSONB       NOT NULL DEFAULT '[]',
  decisions         JSONB       NOT NULL DEFAULT '[]',
  key_topics        TEXT[]      NOT NULL DEFAULT '{}',
  sentiment         TEXT,
  strategic_insights JSONB      NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_meeting_id ON meeting_analyses(meeting_id);

-- ── UPDATED_AT TRIGGER: new tables ───────────────────────────

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
