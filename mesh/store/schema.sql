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

-- Army of OpenClaw: personnel registry (discovery) and orders
-- See OPENCLAW_ARMY_OF_OPENCLAW.md §5 (registry), §4 (orders)
CREATE TABLE IF NOT EXISTS army_registry (
  id TEXT PRIMARY KEY,
  gateway_id TEXT NOT NULL,
  agent_id TEXT,
  rank TEXT NOT NULL,
  unit TEXT NOT NULL,
  platoon TEXT,
  theater TEXT,
  skills TEXT NOT NULL,  -- JSON array e.g. ["research","coding"]
  status TEXT NOT NULL DEFAULT 'available',
  capacity INTEGER,
  ingest_url TEXT,       -- Bridge webhook or gateway ingest URL for orders
  model_ranking TEXT,    -- JSON array of model ids e.g. ["claude-3-opus","ollama/llama3"]
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_army_registry_gateway ON army_registry(gateway_id);
CREATE INDEX IF NOT EXISTS idx_army_registry_unit ON army_registry(unit);
CREATE INDEX IF NOT EXISTS idx_army_registry_status ON army_registry(status);
CREATE INDEX IF NOT EXISTS idx_army_registry_updated ON army_registry(updated_at);

CREATE TABLE IF NOT EXISTS army_orders (
  order_id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'task',
  addressee TEXT NOT NULL,  -- JSON: { gatewayId?, unit?, role? }
  payload TEXT NOT NULL,     -- JSON
  priority TEXT NOT NULL DEFAULT 'normal',
  deadline INTEGER,
  from_node TEXT NOT NULL,
  ts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  target_node_id TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  result TEXT,
  error TEXT,
  strategy TEXT,             -- optional: e.g. research, default
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_army_orders_status ON army_orders(status);
CREATE INDEX IF NOT EXISTS idx_army_orders_created ON army_orders(created_at);
