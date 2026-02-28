# OpenClaw Mesh Phase 2 — Shared Store

Shared store schema and access model for mesh memory and skills (PRD FR-2.1, FR-2.2, FR-2.3). Use when you want a **central** store that all mesh nodes read/write (e.g. on NAS or a small server), instead of or in addition to bridge-only exchange.

## Schema (FR-2.1, FR-2.2)

| Table | Fields |
|-------|--------|
| **mesh_memory** | `scope` (node \| mesh \| user:\<id\>), `key`, `value` (JSON), `node_id`, `updated_at` |
| **mesh_skills** | `name`, `source_node`, `content` or `path`, `updated_at` |

- **schema.sql** — SQLite-compatible DDL. Run once to create the store.
- **schemas/memory-row.json**, **schemas/skill-row.json** — JSON Schema for API row shape.

## Access model (FR-2.3)

See **[access-model.md](access-model.md)** for:

- **Option A:** HTTP API (GET/PUT memory and skills; example endpoints).
- **Option B:** File sync (shared folder; one file or dir per scope/skill).
- **Option C:** Hybrid (bridge + sidecar that writes to store).
- **Authentication/authorization:** TLS, API key or mTLS, scope-based read/write.

## Optional: SQLite client

**client.js** uses [better-sqlite3](https://github.com/JoshuaWise/better-sqlite3) when available. Install on the node that hosts or accesses the shared DB:

```bash
npm install better-sqlite3
```

Usage:

```js
const path = require('path');
const { openStore, syncStoreToLocalCache } = require(path.join(__dirname, 'mesh/store/client.js'));

const store = openStore('/path/to/mesh-store.sqlite');
if (store) {
  store.putMemory('mesh', 'user.preferences', { shortAnswers: true }, 'ceo');
  const row = store.getMemory('mesh', 'user.preferences');
  store.putSkill('triage', 'ceo', '# Triage rules\n...');
  const list = store.listMemory('mesh');
}

// Sync from shared store into local Phase 1 cache (~/.openclaw/mesh-memory.json, mesh/skills/)
syncStoreToLocalCache('/path/to/mesh-store.sqlite', process.env.OPENCLAW_HOME);
```

If `better-sqlite3` is not installed, `openStore()` returns `null` and no SQLite operations run.

## HTTP API server (reference)

**api-server.js** — Reference HTTP API implementing [access-model.md](access-model.md) Option A. Run:

```bash
MESH_STORE_DB_PATH=/path/to/mesh-store.sqlite node mesh/store/api-server.js 4078
```

Optional auth: `MESH_STORE_AUTH_HEADER=X-API-Key` + `MESH_STORE_AUTH_SECRET=secret`, or `MESH_STORE_AUTH_BEARER=token`. Optional rate limit: `MESH_STORE_RATE_LIMIT_PER_MIN=120` (429 when exceeded). Endpoints: `GET /health`, `GET/PUT /mesh/memory`, `GET/PUT /mesh/skills`. Requires `better-sqlite3`; without it or without `MESH_STORE_DB_PATH`, `/mesh/*` returns 503.

## Bootstrap

1. Create the DB and apply schema:
   ```bash
   sqlite3 /path/to/mesh-store.sqlite < mesh/store/schema.sql
   ```
2. Expose the store via HTTP API (your own implementation using the schema) or mount the SQLite file on each node and use **client.js** with a shared path (e.g. NFS/SMB).
3. Optionally run a periodic sync from store to local cache so agents see mesh data without calling the store every time.

## References

- [PRD Phase 2](../PRD.md#phase-2--shared-store)
- [Mesh Phase 1](../README.md) — local cache and message formats
