export const SESSION_SCHEMA_VERSION = 1;

export const SESSION_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_metadata (key, value)
VALUES ('session_schema_version', '${SESSION_SCHEMA_VERSION}');

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cwd TEXT NOT NULL,
  title TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  ordinal INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  summary TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(session_id, ordinal)
);

CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'thinking', 'tool_call', 'tool_result', 'summary')),
  text TEXT,
  model_content TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(message_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_messages_session_ordinal
  ON messages(session_id, ordinal);

CREATE INDEX IF NOT EXISTS idx_parts_message_ordinal
  ON parts(message_id, ordinal);
`;
