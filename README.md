# Raise The OpenClaw

**Curated recipes and reference implementations for [OpenClaw](https://clawdocs.org)** — the open-source autonomous AI agent framework. Run CEO-style orchestrators, multi-node meshes, and dashboards with copy-paste docs and runnable code.

---

## Diagrams

### Raise The OpenClaw at a glance

```mermaid
flowchart TB
  subgraph RTO["Raise The OpenClaw"]
    Docs[Docs: PRD, CEO+Sec, NAS, Mesh design]
    MC[Mission Control dashboard]
    Mesh[mesh/ + bridge/]
  end
  Docs --> MC
  Docs --> Mesh
  MC --> |"open in browser"| Browser[Browser]
  Mesh --> |"Node.js"| Cache["~/.openclaw/ cache"]
  Bridge[Your bridge: Telegram/Discord] -.->|"POST or adapter"| Mesh
  OpenClaw[OpenClaw gateways] -.->|"optional"| MC
```

### Mesh: two nodes and the bridge

```mermaid
flowchart LR
  subgraph CEO_node["CEO node (e.g. Mac Mini)"]
    CEO_GW[CEO Gateway]
    CEO_Cache[Local cache]
  end
  subgraph Sec_node["Sec node (e.g. Synology)"]
    Sec_GW[Sec Gateway]
    Sec_Cache[Local cache]
  end
  Bridge[Bridge channel / webhook]
  CEO_GW --> Bridge
  Bridge --> Sec_GW
  Bridge -.->|"memory & skill messages"| CEO_Cache
  Bridge -.->|"memory & skill messages"| Sec_Cache
```

### Get started: what to run and when

```mermaid
flowchart LR
  A[Clone repo] --> B[Run Mission Control]
  B --> C{Want mesh + bridge?}
  C -->|No| D[Done: dashboard only]
  C -->|Yes| E[Run bridge webhook or wire adapter]
  E --> F[Optional: Phase 2 store / Phase 3 sync]
  F --> G[Done: full mesh]
```

---

## Get started A to Z

**Full step-by-step:** **[GETTING_STARTED.md](GETTING_STARTED.md)** — prerequisites, clone, run dashboard, mesh, bridge, optional store/sync, and full CEO+Sec setup.

**Short path:**

1. **Prerequisites** — Node.js (v18+), Git, a browser. OpenClaw is optional until you connect real gateways.
2. **Clone** — `git clone https://github.com/YOUR_USERNAME/RaiseTheOpenClaw.git && cd RaiseTheOpenClaw`
3. **Mission Control (no install)** — Open `mission-control/index.html` in a browser, or run `npx serve mission-control` and open http://localhost:3000.
4. **Mesh + bridge (optional)** — No `npm install` for mesh/bridge. Run `node bridge/webhook-server.js 4077` to accept POSTs; or call `handleBridgeMessage(payload, { unwrap: 'telegram' })` from your bot. Cache lives under `~/.openclaw/` (or `OPENCLAW_HOME`).
5. **CEO + Sec (optional)** — Install OpenClaw on both nodes, use [CEO + Sec prompts](OPENCLAW_MAC_MINI_CEO_PROMPTS.md) and a shared bridge channel or webhook; wire mesh ingest as in step 4.

---

## What’s in Raise The OpenClaw

| Area | What you get |
|------|----------------|
| **Multi-node mesh** | Share memory and skills across independent OpenClaw gateways (CEO ↔ Sec). Full PRD, message formats, local cache, bridge wiring, shared store schema, and local-first sync. |
| **Mission Control** | Single dashboard for two (or more) gateways: overview, gateways table, per-node detail, bridge status. Design doc + **runnable SPA** you can open in a browser. |
| **CEO + Sec setup** | Mac Mini (CEO) and Synology (Sec) with copy-paste SOUL.md prompts, bindings, and CEO→Sec delegation over a bridge (Telegram/Discord or webhook). |
| **NAS + hardware** | Best-practice designs for OpenClaw on Synology DS1621xs+ and Mac mini: Docker, network, one-cluster vs two-instance. |

Everything is **documentation-first** with **reference code** where it helps: no OpenClaw protocol changes required.

---

## Quick links

- **[Get started A to Z](GETTING_STARTED.md)** — Prerequisites, clone, run dashboard, mesh, bridge, and full CEO+Sec setup.
- **[Product Requirements: OpenClaw Mesh](PRD.md)** — Problem, goals, phased requirements (bridge → shared store → local-first sync), NFRs.
- **[Mission Control dashboard](mission-control/index.html)** — Open in a browser. Overview cards, gateways table, bridge status, add/edit gateway (persists to localStorage).
- **[CEO + Sec prompts](OPENCLAW_MAC_MINI_CEO_PROMPTS.md)** — SOUL.md for CEO, Sec, Research, Coding, Notes, Trading, Family; CEO→Sec bridge options.
- **[Changelog](changelog.md)** — Version history.

---

## Reference implementations

| Repo path | Purpose |
|----------|---------|
| **[mesh/](mesh/)** | **Phase 1:** Message formats (memory/skill), local cache (`~/.openclaw/mesh-memory.json`, `mesh/skills/`), bridge ingest, request/response over bridge. **Phase 2:** [mesh/store/](mesh/store/) — shared store schema (SQLite), access model, optional client. **Phase 3:** [mesh/sync/](mesh/sync/) — sync protocol, LWW merge, optional hash summary. |
| **[bridge/](bridge/)** | Wire mesh into your bridge: `handleBridgeMessage(payload, { unwrap: 'telegram' })` and optional webhook server (`POST /ingest`, `POST /bridge`). |
| **[mission-control/](mission-control/)** | Single-page dashboard (HTML/CSS/JS): gateways, stats, tasks, jobs, approvals, activity feed. |

All runnable with **Node.js** (no extra deps for mesh/bridge; optional `better-sqlite3` for mesh store client).

---

## Documentation (docs)

| Doc | Description |
|-----|--------------|
| [PRD — OpenClaw Mesh](PRD.md) | Product requirements: shared knowledge and skills across a mesh of gateways. |
| [Mesh design & research](OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md) | How to share memory and skills; bridge vs shared store vs CRDT/sync; references (SEDM, SHIMI, D³MAS, agent mesh). |
| [Mission Control design](OPENCLAW_MISSION_CONTROL_DASHBOARD.md) | Dashboard architecture, config schema, UI sections, security, reference implementation options. |
| [CEO + Sec prompts](OPENCLAW_MAC_MINI_CEO_PROMPTS.md) | Copy-paste SOUL.md, bindings, agentToAgent, CEO→Sec delegation (bridge channel/webhook). |
| [CEO + sub-agents setup](OPENCLAW_CEO_SUBAGENTS_SETUP.md) | OpenClaw as CEO with specialist sub-agents: architecture, config, SOUL examples. |
| [Two-node: Mac Mini + Synology](OPENCLAW_TWO_NODE_MAC_NAS_DESIGN.md) | One cluster vs two independent instances; Docker, network. |
| [NAS + Mac mini (Feb 2026)](OPENCLAW_NAS_MACMINI_FEB2026.md) | Gateway on Synology, Ollama on Mac mini: config, network, hardware tiers. |

---

## Changelog

See **[changelog.md](changelog.md)** for version history.

---

## License and contributing

Raise The OpenClaw is shared as reference documentation and code. If you use or adapt it, attribution is appreciated. For OpenClaw itself, see [clawdocs.org](https://clawdocs.org) and the official OpenClaw repositories.

Suggestions and pull requests (e.g. new recipes, fixes, or clearer wording) are welcome.
