/**
 * OpenClaw Mesh Phase 2 — Shared store client (SQLite)
 * Optional: use when the shared store is a SQLite file (e.g. on NAS). Requires better-sqlite3.
 * For API-based stores, use fetch() against the endpoints in access-model.md.
 */

const path = require('path');

let db;
try {
  db = require('better-sqlite3');
} catch {
  db = null;
}

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS mesh_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  node_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(scope, key)
);
CREATE INDEX IF NOT EXISTS idx_mesh_memory_scope_key ON mesh_memory(scope, key);
CREATE TABLE IF NOT EXISTS mesh_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  source_node TEXT NOT NULL,
  content TEXT,
  path TEXT,
  updated_at INTEGER NOT NULL,
  CHECK (content IS NOT NULL OR path IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_mesh_skills_name ON mesh_skills(name);
`;

/**
 * Open or create SQLite store and run schema. Uses better-sqlite3 if available.
 * @param {string} dbPath - Path to SQLite file (e.g. /volume1/openclaw/mesh-store.sqlite)
 * @returns {{ getMemory: Function, putMemory: Function, listMemory: Function, getSkill: Function, putSkill: Function, listSkills: Function } | null}
 */
function openStore(dbPath) {
  if (!dbPath) return null;
  const resolved = path.resolve(dbPath);
  let conn;
  if (db) {
    conn = db(resolved);
    conn.exec(SCHEMA_SQL);
  } else {
    return null;
  }

  const now = () => Math.floor(Date.now() / 1000);

  return {
    getMemory(scope, key) {
      const row = conn.prepare('SELECT scope, key, value, node_id, updated_at FROM mesh_memory WHERE scope = ? AND key = ?').get(scope, key);
      if (!row) return null;
      try {
        return { ...row, value: JSON.parse(row.value) };
      } catch {
        return { ...row, value: row.value };
      }
    },
    putMemory(scope, key, value, nodeId) {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      conn.prepare(
        'INSERT INTO mesh_memory (scope, key, value, node_id, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, node_id = excluded.node_id, updated_at = excluded.updated_at'
      ).run(scope, key, valueStr, nodeId || 'unknown', now());
      return this.getMemory(scope, key);
    },
    listMemory(scope = null) {
      const rows = scope
        ? conn.prepare('SELECT scope, key, value, node_id, updated_at FROM mesh_memory WHERE scope = ? ORDER BY updated_at DESC').all(scope)
        : conn.prepare('SELECT scope, key, value, node_id, updated_at FROM mesh_memory ORDER BY updated_at DESC').all();
      return rows.map((r) => {
        try {
          return { ...r, value: JSON.parse(r.value) };
        } catch {
          return r;
        }
      });
    },
    getSkill(name) {
      return conn.prepare('SELECT name, source_node, content, path, updated_at FROM mesh_skills WHERE name = ?').get(name) || null;
    },
    putSkill(name, sourceNode, content, pathOrNull = null) {
      conn.prepare(
        'INSERT INTO mesh_skills (name, source_node, content, path, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET source_node = excluded.source_node, content = excluded.content, path = excluded.path, updated_at = excluded.updated_at'
      ).run(name, sourceNode, content ?? null, pathOrNull, now());
      return this.getSkill(name);
    },
    listSkills() {
      return conn.prepare('SELECT name, source_node, content, path, updated_at FROM mesh_skills ORDER BY updated_at DESC').all();
    },
  };
}

/**
 * Sync from shared store (SQLite) into local mesh cache (Phase 1 layout).
 * @param {string} dbPath - Path to shared store SQLite file
 * @param {string} [openclawDir] - Local ~/.openclaw
 */
function syncStoreToLocalCache(dbPath, openclawDir) {
  const cache = require(path.join(__dirname, '..', 'cache.js'));
  const store = openStore(dbPath);
  if (!store) return { memory: 0, skills: 0 };
  let memory = 0;
  let skills = 0;
  for (const row of store.listMemory('mesh')) {
    cache.writeMeshMemoryEntry(
      { scope: row.scope, key: row.key, value: row.value, nodeId: row.node_id, ts: row.updated_at },
      openclawDir
    );
    memory++;
  }
  for (const row of store.listSkills()) {
    if (row.content) {
      cache.writeMeshSkill(row.name, row.content, openclawDir);
      skills++;
    }
  }
  return { memory, skills };
}

module.exports = {
  openStore,
  syncStoreToLocalCache,
  SCHEMA_SQL,
};
