# OpenClaw Mesh — Phase 1 Reference Implementation

Reference implementation for **Phase 1** of the [PRD](PRD.md): bridge + structured messages, local cache, and optional request/response over the bridge.

## Layout (FR-1.3)

| What | Path (under `~/.openclaw` or configured dir) |
|------|---------------------------------------------|
| Mesh memory cache | `mesh-memory.json` |
| Mesh skills cache | `mesh/skills/` (one file per skill, e.g. `triage.md`) |

- **Memory:** Single JSON file keyed by `scope:key`; each entry has `value`, `nodeId`, `ts`.
- **Skills:** One file per skill in `mesh/skills/` (`.md` or `.txt`). Name = filename without extension.

Agents/tools can read and write via the paths above, or use the provided Node module (see below).

## Message formats

- **Memory (FR-1.1):** `type: "memory"`, `scope`, `key`, `value`, `nodeId`, `ts`; optional `id`, `userScope`.  
  Schemas: [schemas/memory-message.json](schemas/memory-message.json)
- **Skill (FR-1.2):** `type: "skill"`, `name`, `sourceNode`, `content`; optional `id`, `ts`.  
  Schemas: [schemas/skill-message.json](schemas/skill-message.json)
- **Request/response (FR-1.4):** See [request-response.md](request-response.md) and [schemas/request-message.json](schemas/request-message.json), [schemas/response-message.json](schemas/response-message.json).

## Node usage

Require from the `mesh` folder (e.g. from an OpenClaw tool or bridge handler):

```js
const path = require('path');
const meshDir = path.join(__dirname, '..'); // or path to mesh/

const messages = require(path.join(meshDir, 'messages.js'));
const cache = require(path.join(meshDir, 'cache.js'));
const bridgeIngest = require(path.join(meshDir, 'bridge-ingest.js'));
```

### Creating and sending messages

```js
const mem = messages.createMemoryMessage({
  scope: 'mesh',
  key: 'user.preferences',
  value: { shortAnswers: true },
  nodeId: 'ceo',
});
// Send JSON.stringify(mem) over the bridge.

const skill = messages.createSkillMessage({
  name: 'triage',
  sourceNode: 'ceo',
  content: '# Triage rules\n...',
});
```

### Ingesting from the bridge

When your bridge receives a message, parse and ingest:

```js
const payload = getBridgePayload(); // string or object or array
const result = bridgeIngest.ingestFromBridge(payload);
// result.ingested, result.memory, result.skill
```

### Reading the local cache

```js
const prefs = cache.getMeshMemory('mesh', 'user.preferences');
const skillContent = cache.readMeshSkill('triage');
const skillNames = cache.listMeshSkills();
const allMemory = cache.readMeshMemory();
```

### Writing the local cache directly

```js
cache.writeMeshMemoryEntry({
  scope: 'mesh',
  key: 'user.preferences',
  value: { shortAnswers: true },
  nodeId: 'ceo',
  ts: Math.floor(Date.now() / 1000),
}, openclawDir);
cache.writeMeshSkill('triage', '# Triage rules\n...', openclawDir);
```

Optional second argument everywhere is `openclawDir` (default `~/.openclaw`).

## Tool names / file paths for agents

Agents or tools that need to “read mesh memory” or “read mesh skill” can:

- **Memory:** Read/write `~/.openclaw/mesh-memory.json` (or `process.env.OPENCLAW_HOME + '/mesh-memory.json'` if set).
- **Skills:** List/read files in `~/.openclaw/mesh/skills/`; write new skills as `~/.openclaw/mesh/skills/<name>.md`.

Using this module is optional but ensures consistent structure and merging.

## Request/response (FR-1.4)

- Build requests with `messages.createMeshRequest({ requestId, kind: 'memory'|'skill', nodeId, scope, key })` or `name` for skills.
- Build responses with `messages.createMeshResponse({ requestId, kind, nodeId, found, value|content })`.
- See [request-response.md](request-response.md) for the convention and examples.

## Dependencies

Node only; no extra npm packages. Uses `fs`, `path`, `os`.

## Phase 2 — Shared store

When you add a **central** store (e.g. SQLite on NAS or an HTTP API), see **[store/](store/)** for schema (FR-2.1, FR-2.2), [access-model](store/access-model.md) (FR-2.3), and an optional SQLite client.

## Phase 3 — Local-first sync

Each node keeps a **local replica** (Phase 1 cache). To sync with peers: **[sync/](sync/)** — protocol ([protocol.md](sync/protocol.md)), conflict resolution ([conflict-resolution.md](sync/conflict-resolution.md)), and `sync.js` (`buildSummary`, `mergeDelta`, `computeRequest`, `buildDelta`). Optional [hash-summary.js](sync/hash-summary.js) for smaller summaries (FR-3.3).

## References

- [PRD.md](../PRD.md) — Product requirements (phases 1–3).
- [OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md](../OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md) — Design and research.
