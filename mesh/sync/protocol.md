# Phase 3 — Sync Protocol (FR-3.1)

Each node keeps a **local replica** of mesh memory and mesh skills (Phase 1 cache). Sync is **eventual**: nodes exchange summaries and deltas so replicas converge. Protocol can run over the **bridge** (existing channel/webhook) or a dedicated channel.

---

## 1. Message types

| Type | Direction | Purpose |
|------|-----------|---------|
| **sync_summary** | Either | Send a compact summary of my memory keys and skill names with timestamps (and optional hashes). |
| **sync_request** | Requester → Peer | Request full content for specific memory keys or skills I’m missing or older. |
| **sync_delta** | Peer → Requester | Full entries (memory or skill) in response to sync_request. |

All can be sent as JSON on the bridge (e.g. wrapped in a `type` field so the bridge ingest or a sync handler can route them).

---

## 2. Sync summary (FR-3.3)

A **sync_summary** message reduces payload by sending only identifiers and timestamps (and optionally hashes), not full values.

**Memory summary:** List of `{ scope, key, ts }` or `{ scope, key, ts, h }` where `h` is an optional hash of the value (e.g. SHA-256 of JSON stringified value, first 16 chars hex).

**Skills summary:** List of `{ name, ts }` or `{ name, ts, h }` where `h` is optional hash of content.

**Example:**

```json
{
  "type": "sync_summary",
  "nodeId": "ceo",
  "ts": 1739123456,
  "memory": [
    { "scope": "mesh", "key": "user.preferences", "ts": 1739123400, "h": "a1b2c3d4" }
  ],
  "skills": [
    { "name": "triage", "ts": 1739123300, "h": "e5f6g7h8" }
  ]
}
```

The receiver compares with its local replica: for each key/name, if the peer’s `ts` is greater (or we don’t have it), we need that entry. We then send a **sync_request** for those keys/names.

---

## 3. Sync request

**sync_request** lists memory keys and skill names we want the peer to send.

```json
{
  "type": "sync_request",
  "requestId": "req-sync-1",
  "nodeId": "sec",
  "memory": [["mesh", "user.preferences"]],
  "skills": ["triage"],
  "ts": 1739123460
}
```

---

## 4. Sync delta

**sync_delta** carries full entries: memory entries (scope, key, value, nodeId, ts) and skills (name, sourceNode, content, ts). The receiver **merges** into the local cache using **last-write-wins** (see [conflict-resolution.md](conflict-resolution.md)): only overwrite if incoming `ts` is strictly greater than local.

```json
{
  "type": "sync_delta",
  "requestId": "req-sync-1",
  "nodeId": "ceo",
  "memory": [
    { "scope": "mesh", "key": "user.preferences", "value": {}, "nodeId": "ceo", "ts": 1739123400 }
  ],
  "skills": [
    { "name": "triage", "sourceNode": "ceo", "content": "# Triage\n...", "ts": 1739123300 }
  ]
}
```

---

## 5. Flow

1. Node A sends **sync_summary** on the bridge (or to Node B’s sync endpoint).
2. Node B compares with its local replica; builds **sync_request** for keys/names where A has newer or missing data; sends **sync_request** (or posts to bridge).
3. Node A (or whoever has the data) responds with **sync_delta** containing the full entries.
4. Node B **merges** sync_delta into its local cache (LWW).
5. Optionally, Node B then sends its own **sync_summary** so Node A can pull what it’s missing. Repeat until summaries match (or a fixed number of rounds).

---

## 6. Transport

- **Bridge:** Post sync_summary / sync_request / sync_delta as JSON messages on the existing CEO↔Sec bridge. The other node’s bridge handler or a sync sidecar parses them and runs the merge (or responds with sync_delta).
- **Dedicated channel:** Same message shapes over a separate channel or HTTP endpoint for sync-only traffic.

No OpenClaw gateway protocol change: these are application-level message types on top of the bridge or channel.
