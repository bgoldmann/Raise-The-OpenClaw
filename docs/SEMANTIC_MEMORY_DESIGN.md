# Semantic / vector memory (design only)

Optional **vector layer** for mesh memory: store embeddings of memory values and support **similarity search** (“query by meaning”) in addition to scope/key lookup. This doc is **design only**; implementation is out of scope for the current PRD.

---

## 1. Goal

- Keep existing **scope/key** mesh memory and skills as the primary model.
- Add an optional **semantic index**: when memory is written, optionally compute an embedding (e.g. from a local embedding model or API) and store it in a vector store (e.g. Milvus, or a local embedding DB). Agents or tools can then **query by meaning** (e.g. “memories related to project Alpha”) in addition to exact key lookup.
- Fit with [OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md](../OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md) and [PRD.md](../PRD.md): no change to message formats or required behavior; semantic layer is an optional sidecar or plugin.

---

## 2. Fit with current mesh

- **Write path:** When mesh memory is written (bridge ingest, store API, or sync), an optional **semantic indexer** subscribes or is called, computes an embedding for the value (or scope+key+value), and upserts into the vector store with a reference to (scope, key) or the row id.
- **Read path:** A **query API** (e.g. `POST /mesh/query` or a tool) accepts a natural-language or embedding query and returns top-k (scope, key, value) or references; the caller can then fetch full memory by key if needed.
- **Scoping:** Restrict similarity search by scope (e.g. only `mesh` or `federation`) or by tenant when multi-tenancy is used.

---

## 3. Out of scope (for now)

- Implementation of the indexer, vector DB, or embedding model.
- Changes to mesh message formats or store schema for vector data.
- Production deployment or benchmarking.

Reference: research in [OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md](../OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md) (§2.1) mentions vector DB (e.g. Milvus) and semantic memory; this doc captures the design for a future phase.
