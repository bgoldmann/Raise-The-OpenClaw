# Shared Store Access Model (FR-2.3)

How mesh nodes **read and write** the Phase 2 shared store, and **authentication/authorization** assumptions.

---

## 1. Access patterns

### Option A — HTTP API

A **shared store service** (e.g. on a NAS or a small cloud instance) exposes an HTTP API. Nodes call it to read/write memory and skills.

| Operation | Method | Endpoint (example) | Body / response |
|-----------|--------|--------------------|------------------|
| List memory | GET | `/mesh/memory?scope=mesh` | `[{ scope, key, value, node_id, updated_at }, ...]` |
| Get memory | GET | `/mesh/memory/:scope/:key` | `{ scope, key, value, node_id, updated_at }` |
| Put memory | PUT | `/mesh/memory` | Body: `{ scope, key, value, node_id }` → 200 + row |
| List skills | GET | `/mesh/skills` | `[{ name, source_node, content, path, updated_at }, ...]` |
| Get skill | GET | `/mesh/skills/:name` | `{ name, source_node, content, path, updated_at }` |
| Put skill | PUT | `/mesh/skills` | Body: `{ name, source_node, content }` or `{ ..., path }` → 200 + row |

- **updated_at** is set by the store (server time) on write.
- **Scope** for memory: `node`, `mesh`, or `user:<id>`. Nodes typically write to `mesh` for mesh-wide visibility; `node` and `user:<id>` for scoped data.

### Option B — File sync

The shared store is implemented as **files** (e.g. on a shared drive or Syncthing/Git repo):

- **Memory:** One file per scope or one JSON file (e.g. `mesh-memory.json`) that nodes read/write. Concurrency: single-writer or merge (e.g. last-write-wins by key).
- **Skills:** Directory `mesh/skills/` with one file per skill (e.g. `triage.md`). Metadata (source_node, updated_at) can live in a sidecar (e.g. `triage.meta.json`) or in the first line of the file.

Nodes **read** by reading the file(s); **write** by writing to the shared path. No separate API; access control is via filesystem permissions or share credentials.

### Option C — Hybrid

Nodes use the **bridge** to send memory/skill messages (Phase 1); a **sidecar or gateway** on the same network as the shared store subscribes to the bridge (or receives webhooks), ingests into the store, and optionally exposes an API for query. So: bridge remains the control channel; store is populated by a single writer (the sidecar) and can be read via API or file export.

---

## 2. Authentication and authorization

**Assumptions (NFR-2):**

- Mesh nodes are **trusted peers** or trust is established out-of-band (e.g. same Tailscale network, shared secret).
- **Tokens and secrets** are never stored in mesh-shared memory.
- **Encryption in transit:** Use TLS (HTTPS) for any HTTP API. For file sync, use a secure channel (e.g. Syncthing, SSH, or a mounted encrypted share).

**API access:**

- **Authentication:** Either (1) **none** on a private network (nodes are identified by IP or internal DNS), or (2) **API key / bearer token** per node or per mesh, or (3) **mTLS** (client cert per node). Document the choice for your deployment.
- **Authorization:**
  - **Read:** Any authenticated node may read `mesh` scope and `user:<id>` scopes it is allowed to see (e.g. same user id). `node` scope may be restricted to the owning node only.
  - **Write:** Any authenticated node may write to `mesh`. Writes to `node:<id>` or `user:<id>` may be restricted to the owning node or to a designated “writer” (e.g. CEO node for user prefs).

**File sync:**

- Access control is by **filesystem permissions** and share credentials (e.g. SMB user, Syncthing device). Prefer one writer per file or merge strategy to avoid conflicts.

---

## 3. Recommendation for Raise The OpenClaw

- **Minimal:** Run a small **SQLite-backed API** (e.g. using the [schema](schema.sql)) on one host (e.g. NAS); nodes use an HTTP client to GET/PUT. Auth: API key in a header or query param, or none on LAN.
- **No extra service:** Use **file sync** (shared folder) and the Phase 1 local cache format; one node (or a cron) merges `mesh-memory.json` and `mesh/skills/` from the share into the store layout.
- **Later:** Add **Phase 3** local replicas that sync with the shared store via Merkle-DAG or CRDT; the store becomes one peer or the source of truth.
