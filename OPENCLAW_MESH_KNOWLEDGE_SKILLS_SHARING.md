# OpenClaw Mesh: Sharing Knowledge (Skills) and Shared Memory Between Nodes

Research and design for **sharing knowledge (skills)** and **shared memory** across two or more OpenClaw instances — a **mesh of OpenClaw** nodes. Complements the [two-node Mac + NAS design](OPENCLAW_TWO_NODE_MAC_NAS_DESIGN.md), [CEO → Sec delegation](OPENCLAW_MAC_MINI_CEO_PROMPTS.md#4-ceo--sec-delegation-cross-gateway), and [Mission Control dashboard](OPENCLAW_MISSION_CONTROL_DASHBOARD.md).

**Last updated:** February 2026

---

## 1. What We Mean by “Mesh” and “Knowledge/Skills”

### 1.1 Mesh of OpenClaw

- **Mesh:** Two or more **independent OpenClaw gateways** (Option B in the two-node design), each with its own agents, channels, and config. They are not one cluster (one gateway + nodes) but **peer instances** that can cooperate.
- **Today:** CEO (Mac Mini) and Sec (Synology) communicate via a **bridge** (channel or webhook). There is no built-in cross-gateway memory or skill sync.
- **Goal:** Design how these peers can **share knowledge** (facts, context, learned behaviors) and **skills** (capabilities, SOUL.md-style guidance, reusable procedures) so the mesh behaves more like a single distributed “brain.”

### 1.2 Knowledge vs Skills (for this doc)

| Term | Meaning here | Where it lives today (single node) |
|------|----------------|-------------------------------------|
| **Knowledge** | Facts, context, user preferences, session summaries, long-term memory. | OpenClaw agent **memory** (and SOUL.md for identity). |
| **Skills** | Reusable capabilities: how to do X, when to delegate, tool use patterns, SOUL.md / STYLE.md / installed skills (e.g. from ClawHub). | Agent **SOUL.md**, **agentDir** (skills), tools, bindings. |

In a mesh we want:
- **Shared memory:** Some knowledge visible or synced across nodes (e.g. “user prefers short answers”; “project Alpha context”).
- **Skill sharing:** Ability for one node to benefit from skills or behaviors defined or learned on another (e.g. Sec reusing CEO’s triage rules; shared SOUL snippets).

---

## 2. Research Summary: How Others Share Memory and Skills

### 2.1 Distributed / Shared Memory (2024–2026)

- **SEDM (Scalable Self-Evolving Distributed Memory):** Memory is an active, self-optimizing component; **reproducible replay**, **dynamic ranking**, and **cross-domain knowledge diffusion** reduce noise and scale. Applicable idea: a **shared memory layer** that multiple agents/nodes can read/write with clear semantics.
- **Collaborative Memory (multi-user/multi-agent):** **Asymmetric access control** (who can read/write what), **private vs shared tiers**, **provenance**. For a mesh: we need clear **ownership and visibility** (e.g. CEO node vs Sec node, or user-scoped).
- **SHIMI (Semantic Hierarchical Memory Index):** **Decentralized**: each agent has a **local memory tree** and syncs **asynchronously** with **Merkle-DAG summaries**, **Bloom filters**, and **CRDT-style conflict resolution**. Good fit for mesh: no single central store; eventual consistency.
- **OpenAgents + Milvus:** **Vector DB** as shared semantic memory; agents discover and coordinate around **shared goals** with **data isolation**. Suggests a **shared vector store** (or index) as one option for the mesh.
- **memX:** **Real-time shared memory layer** for multi-agent LLM systems. Suggests a **dedicated memory service** that all nodes can call.

Takeaways:
- Prefer **eventual consistency** and **local-first** so nodes work offline.
- Use **hierarchical or tiered** memory (private per node vs shared).
- **CRDTs or Merkle-DAG** help sync without a single master.
- **Access control** is critical when sharing across nodes.

### 2.2 Skill / Knowledge Transfer Between Agents

- **SkillOrchestra:** **Skill-aware orchestration** — learn **fine-grained skills** from execution and **route** to the right agent. For mesh: we can treat each node (or agent) as having a **skill profile** and route tasks accordingly.
- **D³MAS (Decompose, Deduce, Distribute):** **Task decomposition**, **collaborative reasoning**, **distributed memory**; reduces **redundancy** (e.g. 47% duplication) and improves accuracy. For mesh: avoid every node re-learning the same thing; **distribute** knowledge and **deduplicate**.
- **Experience inheritance:** Transfer **replay buffers**, **graph memory** (trajectories), **skill libraries** (action sequences + natural language). For mesh: **skill libraries** and **shared procedure docs** (e.g. “how CEO triages”) can be synced.
- **BiKT (Bi-Level Knowledge Transfer):** Transfer both **individual skills** and **coordination patterns** (“tactics”). For CEO+Sec: shared **triage tactics** and **delegation patterns** as first-class shared knowledge.

Takeaways:
- **Explicit skill descriptors** (what this node/agent can do) help routing and sharing.
- **Shared “playbooks”** (SOUL snippets, STYLE, procedures) reduce duplication.
- **Coordination patterns** (who does what, when) should be part of shared knowledge.

### 2.3 Sync and Consistency (CRDT / Decentralized)

- **NextGraph / Hypergraph:** **CRDTs** (e.g. Yjs, Automerge, GraphCRDT) for **conflict-free sync** of structured data; **local-first**, **encrypted**, **semantic** (e.g. RDF). For mesh: a **shared knowledge graph or doc** that syncs with CRDTs.
- **SHIMI:** **Lightweight sync** with **Merkle-DAG**, **Bloom filters**, **CRDT-style** merge. For mesh: **minimal overhead** sync of memory summaries or skill metadata.

Takeaways:
- **CRDTs** or **Merkle-DAG + merge rules** allow sync without a central server.
- **Bloom filters** can reduce sync payload (e.g. “what I have” before full sync).

### 2.4 Agent Mesh Protocols (Federated, P2P)

- **Agent Communication Protocol (ACP):** **Federated** A2A orchestration, **zero-trust**, **capability-based**.
- **Agent Mesh Protocol (AMP):** **Discovery**, **routing**, **capability negotiation**, **task coordination** across frameworks.
- **HyperCortex Mesh (HMP):** Agents **self-organize**, **share knowledge**, **consensus** with **cognitive continuity**.

Takeaways:
- Mesh needs **registration/discovery** (which nodes exist, what they can do).
- **Capability/skill advertising** and **task routing** are first-class.
- **Trust and identity** matter when sharing memory/skills across nodes.

---

## 3. Design: Best Ways to Share Memory and Knowledge in an OpenClaw Mesh

### 3.1 Principles

1. **No OpenClaw protocol change required for v1** — use existing bridge (channel/webhook) and optional sidecar services or shared storage.
2. **Explicit over implicit** — shared knowledge and skills are **declared** (e.g. in a shared store or in messages), not magic.
3. **Tiered visibility** — **node-private** (default), **mesh-shared** (visible to all nodes), optionally **user-scoped** or **project-scoped**.
4. **Eventual consistency** — nodes can work offline; sync when connected.
5. **Security** — tokens, encryption at rest/transit, and access control for any shared store.

### 3.2 Option A — Bridge-Channel as Shared “Memory” and “Skills” Channel

**Idea:** Use the **same bridge channel** (or a second channel) not only for tasks but for **structured knowledge and skill messages**.

- **Knowledge:** One node posts structured messages, e.g. `{"type":"memory","scope":"mesh","key":"user.preferences","value":{"shortAnswers":true}}`. Other nodes (or a small parser) read and inject into their context or local memory.
- **Skills:** Post **skill descriptors** or **SOUL/STYLE snippets**: `{"type":"skill","name":"triage","source":"ceo","content":"…"}`. Sec (or another node) can incorporate into its SOUL.md or a local “shared skills” file.

**Pros:** No new infra; reuses bridge.  
**Cons:** Channel is not a database; no query, no CRDT; order and dedup are manual. Good for **low volume** and **experimentation**.

### 3.3 Option B — Shared Store (SQLite / Vector DB / File Sync)

**Idea:** Introduce a **shared store** that all mesh nodes can read/write (via bridge sidecar or a small service).

- **Store types:**
  - **SQLite** (or Postgres): key-value or tables for memory entries, skill metadata, provenance (node_id, timestamp).
  - **Vector DB** (e.g. Milvus, or local embedding DB): semantic memory; nodes write embeddings + metadata; others query by similarity.
  - **File sync:** A shared folder (e.g. Synology drive, or Git repo) that each node reads: e.g. `mesh/memory/`, `mesh/skills/`. Use **file-based CRDT** (e.g. same format as NextGraph) or **periodic sync** (rsync, Syncthing).

- **Schema (minimal):**
  - **Memory:** `(id, scope, key, value, node_id, updated_at)` — scope = `node` | `mesh` | `user:<id>`.
  - **Skills:** `(id, name, source_node, content_or_path, updated_at)` — content = SOUL snippet, procedure, or pointer to file.

**Pros:** Queryable, versioned, can add access control.  
**Cons:** Requires a shared store or sync mechanism; not strictly “local-first” unless you use file sync + CRDT.

### 3.4 Option C — Mesh Sync Service (CRDT / Merkle-DAG Style)

**Idea:** A **lightweight sync service** (or sidecar per node) that:

- Keeps **local copy** of “mesh memory” and “mesh skills” on each node.
- Syncs **asynchronously** with other nodes (or a neutral relay) using **Merkle-DAG** or **CRDT**-like merges so there is no single master.
- Each node **writes locally**; sync propagates changes; conflicts resolved by **last-write-wins** or **CRDT merge**.

**Pros:** Local-first, works offline, no single point of failure.  
**Cons:** More implementation work; need to define schema and merge rules.

### 3.5 Option D — Skill and Memory “Registry” Over the Bridge

**Idea:** Treat the bridge as a **control channel** for **advertising and requesting** skills/memory, not only for tasks.

- **Discovery:** Each node periodically (or on demand) posts **skill summaries** to the bridge: “I am Sec; I can do: triage, reminders, light research.”
- **Request/response:** Node A asks: “Who has memory for key X?” or “Send me skill Y.” Node B replies on the bridge with payload or pointer.
- **Caching:** Nodes keep a **local cache** of received memory and skill snippets to avoid repeated requests.

**Pros:** No shared DB; works with current bridge.  
**Cons:** Chatty; ordering and consistency are best-effort unless you add sequence ids and acks.

---

## 4. Recommended “Best” Design (Pragmatic)

For a **mesh of OpenClaw** (e.g. CEO + Sec today; more nodes later) without changing OpenClaw itself:

### 4.1 Phase 1 — Bridge + Structured Messages (Option A + D)

- **Keep** the existing **bridge channel** (or webhook) for **tasks** (CEO → Sec).
- **Add** a **structured message convention** on the same bridge (or a second “mesh” channel):
  - **Memory:** `type: "memory"`, `scope: "mesh"`, `key`, `value`, `nodeId`, `ts`. Other nodes can **ingest** into their local memory or a small **local cache file** (e.g. `~/.openclaw/mesh-memory.json`).
  - **Skills:** `type: "skill"`, `name`, `sourceNode`, `content` (or URL). Nodes that want to “learn” this skill **write** it into their agentDir or a `mesh/skills/` folder and reference in SOUL.md.
- **Optional:** Simple **request/response** on the bridge: “Request: memory key X” → “Response: value.” So we get Option D without a registry server.

**Best for:** Minimal setup, two to a few nodes, low volume. **Shared memory** = “what we post and cache”; **skill sharing** = “post SOUL snippets or procedures; others copy into their config.”

### 4.2 Phase 2 — Shared Store or File Sync (Option B)

- Introduce a **shared store** that all nodes can reach (e.g. NAS path, or a tiny API on the Synology):
  - **Memory table** (scope, key, value, node_id, updated_at).
  - **Skills table** (name, source_node, content, updated_at).
- Each OpenClaw node uses a **tool or script** to:
  - **Read** mesh memory before/during a session (inject into context).
  - **Write** mesh memory when the agent decides to share.
  - **Read** mesh skills and optionally merge into SOUL or load as “procedures.”

**Best for:** More nodes, more memory, need for **query** and **history**. **Shared memory** = single source of truth (or primary); **skill sharing** = central registry.

### 4.3 Phase 3 — Local-First Sync (Option C)

- Add a **sync agent or sidecar** that:
  - Maintains **local** `mesh-memory` and `mesh-skills` (e.g. JSON or SQLite per node).
  - Syncs with other nodes via **Merkle-DAG** or **CRDT** (e.g. Automerge, Yjs) over the bridge or a dedicated channel.
- **Conflict resolution:** Last-write-wins or CRDT merge by key. **Bloom filter** or **hash summary** to reduce sync size.

**Best for:** Many nodes, offline-first, no single store. **Shared memory** and **skill sharing** become **eventually consistent** across the mesh.

---

## 5. What to Put in Shared Memory vs Skills

### 5.1 Good Candidates for Shared Memory

- User preferences (e.g. “short answers”, “use metric”).
- Project or context summaries (e.g. “Project Alpha: …”).
- Cross-node session summaries (e.g. “CEO asked Sec to do X; result: Y”).
- Factual cache (e.g. “user’s timezone”, “current focus project”).

### 5.2 Good Candidates for Skill Sharing

- **SOUL.md snippets:** e.g. “Triage rules”, “Tone: professional and concise.”
- **Procedure docs:** “How to hand off to Sec”, “When to escalate to CEO.”
- **Skill descriptors:** “I can do: triage, reminders, light research” (for discovery and routing).
- **STYLE.md or templates:** Shared formatting and phrasing so all nodes feel consistent.

### 5.3 Keep Node-Local (Not Shared)

- Secrets, tokens, credentials.
- Node-specific tools and bindings (unless explicitly publishing “I have tool X”).
- Purely local session state that has no mesh value.

---

## 6. Integration with Existing Raise The OpenClaw

| Doc | Link |
|-----|------|
| Two-node (Mac + NAS) | [OPENCLAW_TWO_NODE_MAC_NAS_DESIGN.md](OPENCLAW_TWO_NODE_MAC_NAS_DESIGN.md) — Option B = two gateways = mesh. |
| CEO → Sec bridge | [OPENCLAW_MAC_MINI_CEO_PROMPTS.md#4](OPENCLAW_MAC_MINI_CEO_PROMPTS.md#4-ceo--sec-delegation-cross-gateway) — bridge channel/webhook; extend with memory/skill messages. |
| Mission Control | [OPENCLAW_MISSION_CONTROL_DASHBOARD.md](OPENCLAW_MISSION_CONTROL_DASHBOARD.md) — dashboard can show “mesh memory” or “mesh skills” if you add a store or bridge parser. |

---

## 7. References

- SEDM: Scalable Self-Evolving Distributed Memory (arXiv 2509.09498).
- Collaborative Memory: Multi-User Memory Sharing in LLM Agents (arXiv 2505.18279).
- SHIMI: Semantic Hierarchical Memory Index for Decentralized Agent Reasoning (arXiv 2504.06135).
- OpenAgents + Milvus: multi-agent shared memory (Milvus blog).
- SkillOrchestra: Skill Transfer and Routing (arXiv 2602.19672).
- D³MAS: Decompose, Deduce, Distribute for Knowledge Sharing (arXiv 2510.10585).
- Experience Inheritance in Multi-Agent Systems (emergentmind.com).
- NextGraph / CRDTs and sync (docs.nextgraph.org).
- Agent Mesh / ACP / AMP (agenticmesh.network, agentmeshprotocol.io, arXiv 2602.15055).
- OpenClaw: SOUL.md, memory, skills (docs.openclaw.ai, learnopenclaw.com).

---

## 8. Summary

- **Knowledge sharing** in an OpenClaw mesh = **shared memory** (facts, context, preferences) with **tiered scope** (node vs mesh) and **access control**.
- **Skill sharing** = **SOUL/STYLE snippets**, **procedure docs**, and **skill descriptors** so nodes can reuse behaviors and advertise capabilities.
- **Best design for now:** Use the **existing bridge** and add **structured memory/skill messages** plus optional **local cache** (Phase 1). Evolve to a **shared store** (Phase 2) or **CRDT/local-first sync** (Phase 3) as the mesh grows.
- Research from **SEDM, SHIMI, D³MAS, agent mesh protocols**, and **CRDT-based sync** informs a **scalable, decentralized** design without requiring changes to the OpenClaw gateway protocol.
