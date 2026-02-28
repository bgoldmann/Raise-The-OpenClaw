# OpenClaw Mesh Phase 3 — Local-First Sync

Local replica and sync protocol (PRD FR-3.1, FR-3.2, FR-3.3). Each node keeps a local replica (Phase 1 cache); nodes exchange **summaries** and **deltas** to converge. Conflict resolution is **last-write-wins** by key/name.

## Protocol

- **[protocol.md](protocol.md)** — Message types: `sync_summary`, `sync_request`, `sync_delta`. Flow: send summary → peer computes what it needs → request → delta → merge. Optional hash in summary to reduce payload (FR-3.3).
- **[conflict-resolution.md](conflict-resolution.md)** — LWW rule: greater `ts` wins for memory `(scope, key)` and for skill `name`. Skills use file mtime as local `ts` when no explicit ts is stored.

## Usage

```js
const path = require('path');
const sync = require(path.join(__dirname, 'mesh/sync/sync.js'));

// Build my summary (to send on the bridge or to a sync endpoint)
const summary = sync.buildSummary('ceo', process.env.OPENCLAW_HOME, { includeHash: true });

// On receipt of a peer's summary: compute what to request
const need = sync.computeRequest(summary, process.env.OPENCLAW_HOME);

// Build delta for that request (from my local cache) and send to peer
const delta = sync.buildDelta(need, 'ceo', process.env.OPENCLAW_HOME, 'req-1');

// On receipt of a sync_delta: merge into local cache (LWW)
const result = sync.mergeDelta(delta, process.env.OPENCLAW_HOME);
// result.memoryWritten, result.skillsWritten
```

Transport is up to you: post `summary` / `sync_request` / `delta` as JSON on the bridge, or over a dedicated HTTP sync endpoint. The bridge adapter does not parse sync messages by default; add a handler that detects `type: 'sync_summary'` / `sync_request` / `sync_delta` and calls these functions (and optionally sends back `sync_delta` when you receive a `sync_request`).

## Modules

| File | Purpose |
|------|---------|
| **sync.js** | `buildSummary`, `mergeDelta`, `computeRequest`, `buildDelta`, `getSkillTs`. |
| **hash-summary.js** | Optional: `hashValue`, `hashString` (first 16 hex of SHA-256) for summary hashes. |
| **protocol.md** | Sync message shapes and flow. |
| **conflict-resolution.md** | LWW rule and alternatives. |

## References

- [PRD Phase 3](../PRD.md#phase-3--local-first-sync)
- [Phase 1 cache](../README.md) — local replica layout
