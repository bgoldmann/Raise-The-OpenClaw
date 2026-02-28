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
CREATE TABLE IF NOT EXISTS army_registry (
  id TEXT PRIMARY KEY,
  gateway_id TEXT NOT NULL,
  agent_id TEXT,
  rank TEXT NOT NULL,
  unit TEXT NOT NULL,
  platoon TEXT,
  theater TEXT,
  skills TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  capacity INTEGER,
  ingest_url TEXT,
  model_ranking TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_army_registry_gateway ON army_registry(gateway_id);
CREATE INDEX IF NOT EXISTS idx_army_registry_unit ON army_registry(unit);
CREATE INDEX IF NOT EXISTS idx_army_registry_status ON army_registry(status);
CREATE INDEX IF NOT EXISTS idx_army_registry_updated ON army_registry(updated_at);
CREATE TABLE IF NOT EXISTS army_orders (
  order_id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'task',
  addressee TEXT NOT NULL,
  payload TEXT NOT NULL,
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
  strategy TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_army_orders_status ON army_orders(status);
CREATE INDEX IF NOT EXISTS idx_army_orders_created ON army_orders(created_at);
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
    // Migration: add model_ranking to existing army_registry if missing
    const cols = conn.prepare("PRAGMA table_info(army_registry)").all();
    if (cols.every((c) => c.name !== 'model_ranking')) {
      try {
        conn.exec('ALTER TABLE army_registry ADD COLUMN model_ranking TEXT');
      } catch (_) {}
    }
    // Migration: add strategy to existing army_orders if missing
    const orderCols = conn.prepare("PRAGMA table_info(army_orders)").all();
    if (orderCols.every((c) => c.name !== 'strategy')) {
      try {
        conn.exec('ALTER TABLE army_orders ADD COLUMN strategy TEXT');
      } catch (_) {}
    }
  } else {
    return null;
  }

  const now = () => Math.floor(Date.now() / 1000);

  function parseModelRanking(val) {
    if (val == null || val === '') return null;
    try {
      const arr = typeof val === 'string' ? JSON.parse(val) : val;
      return Array.isArray(arr) ? arr : null;
    } catch {
      return null;
    }
  }

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
    // Army registry (OPENCLAW_ARMY_OF_OPENCLAW.md §5)
    registerNode(row) {
      const skillsStr = Array.isArray(row.skills) ? JSON.stringify(row.skills) : (row.skills || '[]');
      const modelRankingVal = row.model_ranking != null
        ? (Array.isArray(row.model_ranking) ? JSON.stringify(row.model_ranking) : String(row.model_ranking))
        : null;
      conn.prepare(
        `INSERT INTO army_registry (id, gateway_id, agent_id, rank, unit, platoon, theater, skills, status, capacity, ingest_url, model_ranking, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
         gateway_id=excluded.gateway_id, agent_id=excluded.agent_id, rank=excluded.rank, unit=excluded.unit,
         platoon=excluded.platoon, theater=excluded.theater, skills=excluded.skills, status=excluded.status,
         capacity=excluded.capacity, ingest_url=excluded.ingest_url, model_ranking=excluded.model_ranking, updated_at=excluded.updated_at`
      ).run(
        row.id || row.gateway_id + (row.agent_id ? '-' + row.agent_id : ''),
        row.gateway_id,
        row.agent_id ?? null,
        row.rank || 'specialist',
        row.unit || 'squad-1',
        row.platoon ?? null,
        row.theater ?? null,
        skillsStr,
        row.status || 'available',
        row.capacity ?? null,
        row.ingest_url ?? null,
        modelRankingVal,
        now()
      );
      return this.getNode(row.id || row.gateway_id + (row.agent_id ? '-' + row.agent_id : ''));
    },
    getNode(id) {
      const row = conn.prepare('SELECT * FROM army_registry WHERE id = ?').get(id);
      if (!row) return null;
      try {
        const skills = JSON.parse(row.skills || '[]');
        const model_ranking = parseModelRanking(row.model_ranking);
        return { ...row, skills, model_ranking };
      } catch {
        const model_ranking = parseModelRanking(row.model_ranking);
        return { ...row, skills: [], model_ranking };
      }
    },
    listNodes(filters = {}) {
      let sql = 'SELECT * FROM army_registry WHERE 1=1';
      const params = [];
      if (filters.skill) {
        sql += " AND skills LIKE ?";
        params.push('%' + filters.skill + '%');
      }
      if (filters.unit) {
        sql += ' AND unit = ?';
        params.push(filters.unit);
      }
      if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }
      if (filters.rank) {
        sql += ' AND rank = ?';
        params.push(filters.rank);
      }
      sql += ' ORDER BY updated_at DESC';
      const rows = conn.prepare(sql).all(...params);
      return rows.map((r) => {
        try {
          const skills = JSON.parse(r.skills || '[]');
          const model_ranking = parseModelRanking(r.model_ranking);
          return { ...r, skills, model_ranking };
        } catch {
          const model_ranking = parseModelRanking(r.model_ranking);
          return { ...r, skills: [], model_ranking };
        }
      });
    },
    listUnits() {
      const rows = conn.prepare('SELECT DISTINCT unit, platoon, theater FROM army_registry ORDER BY theater, platoon, unit').all();
      return rows;
    },
    updateNode(id, updates) {
      const node = this.getNode(id);
      if (!node) return null;
      const allowed = ['status', 'capacity', 'ingest_url', 'skills', 'rank', 'unit', 'platoon', 'theater', 'model_ranking'];
      const ts = now();
      for (const k of allowed) {
        if (updates[k] !== undefined) {
          if (k === 'skills') {
            conn.prepare('UPDATE army_registry SET skills = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updates[k]), ts, id);
          } else if (k === 'model_ranking') {
            const val = updates[k] == null ? null : (Array.isArray(updates[k]) ? JSON.stringify(updates[k]) : String(updates[k]));
            conn.prepare('UPDATE army_registry SET model_ranking = ?, updated_at = ? WHERE id = ?').run(val, ts, id);
          } else {
            conn.prepare(`UPDATE army_registry SET ${k} = ?, updated_at = ? WHERE id = ?`).run(updates[k], ts, id);
          }
        }
      }
      conn.prepare('UPDATE army_registry SET updated_at = ? WHERE id = ?').run(ts, id);
      return this.getNode(id);
    },
    /** Mark registry nodes as offline when updated_at is older than ttlSec (for ARMY_REGISTRY_TTL_SEC). */
    markStaleRegistryNodesOffline(ttlSec) {
      const cutoff = now() - ttlSec;
      const r = conn.prepare("UPDATE army_registry SET status = 'offline' WHERE status != 'offline' AND updated_at < ?").run(cutoff);
      return r.changes;
    },
    // Army orders and dispatcher state
    putOrder(order) {
      const ts = now();
      const addresseeStr = typeof order.addressee === 'string' ? order.addressee : JSON.stringify(order.addressee || {});
      const payloadStr = typeof order.payload === 'string' ? order.payload : JSON.stringify(order.payload || {});
      conn.prepare(
        `INSERT INTO army_orders (order_id, type, addressee, payload, priority, deadline, from_node, ts, status, target_node_id, retry_count, max_retries, result, error, strategy, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(order_id) DO UPDATE SET addressee=excluded.addressee, payload=excluded.payload, priority=excluded.priority, deadline=excluded.deadline,
         status=excluded.status, target_node_id=excluded.target_node_id, retry_count=excluded.retry_count, result=excluded.result, error=excluded.error, strategy=excluded.strategy, updated_at=excluded.updated_at`
      ).run(
        order.orderId,
        order.type || 'task',
        addresseeStr,
        payloadStr,
        order.priority || 'normal',
        order.deadline ?? null,
        order.from || 'unknown',
        order.ts ?? ts,
        order.status || 'pending',
        order.target_node_id ?? null,
        order.retry_count ?? 0,
        order.max_retries ?? 3,
        order.result ?? null,
        order.error ?? null,
        order.strategy ?? null,
        order.created_at ?? ts,
        ts
      );
      return this.getOrder(order.orderId);
    },
    getOrder(orderId) {
      const row = conn.prepare('SELECT * FROM army_orders WHERE order_id = ?').get(orderId);
      if (!row) return null;
      try {
        return { ...row, addressee: JSON.parse(row.addressee || '{}'), payload: JSON.parse(row.payload || '{}') };
      } catch {
        return { ...row, addressee: {}, payload: {} };
      }
    },
    listOrders(filters = {}) {
      let sql = 'SELECT * FROM army_orders WHERE 1=1';
      const params = [];
      if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }
      sql += ' ORDER BY created_at DESC';
      const rows = conn.prepare(sql).all(...params);
      return rows.map((r) => {
        try {
          return { ...r, addressee: JSON.parse(r.addressee || '{}'), payload: JSON.parse(r.payload || '{}') };
        } catch {
          return { ...r, addressee: {}, payload: {} };
        }
      });
    },
    updateOrder(orderId, updates) {
      const order = this.getOrder(orderId);
      if (!order) return null;
      const now = Math.floor(Date.now() / 1000);
      const allowed = ['status', 'target_node_id', 'retry_count', 'result', 'error'];
      for (const k of allowed) {
        if (updates[k] !== undefined) {
          conn.prepare(`UPDATE army_orders SET ${k} = ?, updated_at = ? WHERE order_id = ?`).run(updates[k], now, orderId);
        }
      }
      return this.getOrder(orderId);
    },
    countOrdersByStatus(status) {
      return conn.prepare('SELECT COUNT(*) as n FROM army_orders WHERE status = ?').get(status).n;
    },
    countInProgressByNode(nodeId) {
      return conn.prepare('SELECT COUNT(*) as n FROM army_orders WHERE status = ? AND target_node_id = ?').get('in_progress', nodeId).n;
    },
    /** Mark orders as failed when deadline has passed (for deadline-exceeded background job). */
    markOrdersDeadlineExceeded() {
      const nowTs = now();
      const r = conn.prepare(
        "UPDATE army_orders SET status = 'failed', error = 'Deadline exceeded', updated_at = ? WHERE deadline IS NOT NULL AND deadline < ? AND status IN ('pending', 'in_progress')"
      ).run(nowTs, nowTs);
      return r.changes;
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
