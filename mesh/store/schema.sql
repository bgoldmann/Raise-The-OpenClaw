-- OpenClaw Mesh Phase 2 — Shared store schema (FR-2.1, FR-2.2)
-- SQLite-compatible. Use for a central store that mesh nodes read/write via API or file sync.

-- Shared memory: scope, key, value, node_id, updated_at (FR-2.1)
-- Scopes: 'node' | 'mesh' | 'user:<id>'
CREATE TABLE IF NOT EXISTS mesh_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK (scope IN ('node', 'mesh') OR scope LIKE 'user:%'),
  key TEXT NOT NULL,
  value TEXT NOT NULL,  -- JSON-encoded
  node_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,  -- Unix seconds
  UNIQUE(scope, key)
);

CREATE INDEX IF NOT EXISTS idx_mesh_memory_scope_key ON mesh_memory(scope, key);
CREATE INDEX IF NOT EXISTS idx_mesh_memory_updated_at ON mesh_memory(updated_at);

-- Shared skills: name, source_node, content or path, updated_at (FR-2.2)
CREATE TABLE IF NOT EXISTS mesh_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  source_node TEXT NOT NULL,
  content TEXT,   -- Inline content (SOUL snippet, procedure text)
  path TEXT,      -- Or path/URL to content (mutually exclusive with content for optional use)
  updated_at INTEGER NOT NULL,
  CHECK (content IS NOT NULL OR path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_mesh_skills_name ON mesh_skills(name);
CREATE INDEX IF NOT EXISTS idx_mesh_skills_updated_at ON mesh_skills(updated_at);
