# Phase 3 — Conflict Resolution (FR-3.2)

Defined rule for resolving concurrent updates to the same mesh memory key or skill name across nodes.

---

## Rule: Last-Write-Wins (LWW)

- **Memory:** For each `(scope, key)`, the entry with the **greatest `ts`** (Unix seconds) wins. On sync, if the incoming entry has `ts` strictly greater than the local entry’s `ts`, the local cache is updated; otherwise the local value is kept.
- **Skills:** For each **skill name**, the version with the **greatest `ts`** wins. If the local skill is represented by a file, its modification time (`mtime`) is used as its timestamp when comparing. Incoming skills with a higher `ts` overwrite the local file.

No merge of content (e.g. no CRDT merge of text). Same key or same name ⇒ one winner by time.

---

## Rationale

- **Simple:** No vector clocks or CRDT metadata; easy to implement and reason about.
- **Deterministic:** Given the same set of entries, every node converges to the same state after sync.
- **Good enough for** preferences, context summaries, and skill snippets where “newest wins” is acceptable.

---

## Alternatives (future)

- **CRDT merge:** For skills that are long documents, a CRDT (e.g. Automerge, Yjs) would allow concurrent edits without losing updates. Out of scope for Raise The OpenClaw Phase 3; the protocol and sync code can be extended later to carry CRDT payloads.
- **Node priority:** Some deployments might want “CEO node wins over Sec for key X.” That can be implemented as a layer on top of LWW (e.g. when `ts` is equal, prefer a configured node id).
