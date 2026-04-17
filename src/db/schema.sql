-- ATLAS schema
-- Nueva DB dedicada. Todas las tablas en public.

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,          -- wa_id del usuario (ej: 51932745256)
  program         TEXT,                       -- m595 | ade | saleads | academy | unknown
  email           TEXT,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  escalated       BOOLEAN NOT NULL DEFAULT false,
  escalated_at    TIMESTAMPTZ,
  intake_stage    TEXT NOT NULL DEFAULT 'new',  -- new | asked_program | asked_email | ready
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS messages (
  id              BIGSERIAL PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  wamid           TEXT,                        -- id de whatsapp si aplica
  body            TEXT NOT NULL,
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_session_idx ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS messages_wamid_idx ON messages(wamid) WHERE wamid IS NOT NULL;

CREATE TABLE IF NOT EXISTS escalations (
  id              BIGSERIAL PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,
  summary         TEXT NOT NULL,
  email_sent_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kb_documents (
  id              BIGSERIAL PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,        -- ej: faq-bonos, esfera-f1
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

CREATE TABLE IF NOT EXISTS kb_revisions (
  id              BIGSERIAL PRIMARY KEY,
  document_id     BIGINT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT
);

CREATE TABLE IF NOT EXISTS kb_ingests (
  id              BIGSERIAL PRIMARY KEY,
  vector_store_id TEXT NOT NULL,
  file_id         TEXT,
  status          TEXT NOT NULL,                -- pending | completed | failed
  documents_count INT NOT NULL DEFAULT 0,
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS webhook_events (
  wamid           TEXT PRIMARY KEY,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
