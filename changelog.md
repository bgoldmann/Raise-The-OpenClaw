# Changelog

All notable changes to the Raise The OpenClaw project are documented here.

## [Unreleased]

_Nothing yet._

## [0.5.2] — 2026-02-27

### Changed
- **Project rename** — OpenClaw CookBook → **Raise The OpenClaw**. Updated README, GETTING_STARTED, CHANGELOG, and doc references; clone URL now `RaiseTheOpenClaw.git`. Mission Control title set to "Raise The OpenClaw — Mission Control". Doc references to "cookbook" updated; mesh and store JSON schema `$id` values updated to `https://raise-the-openclaw/...`.

## [0.5.1] — 2026-02-27

### Added
- **GETTING_STARTED.md** — Full A-to-Z: prerequisites (Node, Git, browser, optional OpenClaw), clone, run Mission Control (open HTML or npx serve), mesh + bridge (no install, webhook server, adapter wiring), optional Phase 2 store and Phase 3 sync, full CEO+Sec setup, verification table, next steps.
- **README.md** — Three Mermaid diagrams: CookBook at a glance (docs + Mission Control + mesh/bridge), mesh two-node + bridge topology, get-started flow (clone → dashboard → optional mesh → done). New "Get started A to Z" section with short path (5 steps) and link to GETTING_STARTED.md. Quick links: added Get started A to Z.

## [0.5.0] — 2026-02-27

### Changed
- **README.md** — Rewritten for public GitHub: eye-catching structure with "What's in the CookBook" table, quick links, reference implementations table, cookbook entries table; clear value prop (recipes + runnable code for mesh, Mission Control, CEO+Sec); quick links to PRD, Mission Control dashboard, CEO prompts, changelog; license/contributing note.

## [0.4.9] — 2026-02-27

### Added
- **mesh/sync/** — Phase 3 local-first sync (PRD FR-3.1, FR-3.2, FR-3.3). **protocol.md**: sync message types (sync_summary, sync_request, sync_delta), flow, optional hash in summary. **conflict-resolution.md**: last-write-wins by (scope, key) and by skill name. **sync.js**: buildSummary (from local cache), mergeDelta (LWW merge), computeRequest (what to request from peer summary), buildDelta (build delta for request), getSkillTs (skill file mtime). **hash-summary.js**: optional hashValue/hashString (SHA-256 prefix) for sync efficiency. **sync/README.md**: protocol summary, usage, module list. mesh/README.md: Phase 3 sync section.

## [0.4.8] — 2026-02-27

### Added
- **mesh/store/** — Phase 2 shared store (PRD FR-2.1, FR-2.2, FR-2.3). **schema.sql**: SQLite schema for mesh_memory (scope, key, value, node_id, updated_at) and mesh_skills (name, source_node, content/path, updated_at). **schemas/memory-row.json**, **schemas/skill-row.json**: JSON Schema for API row shape. **access-model.md**: access patterns (HTTP API, file sync, hybrid), authentication/authorization assumptions. **client.js**: optional SQLite client (better-sqlite3) with openStore, get/put/list memory and skills, syncStoreToLocalCache. **store/README.md**: schema summary, access model link, client usage, bootstrap. mesh/README.md: link to Phase 2 store.

## [0.4.7] — 2026-02-27

### Added
- **bridge/** — Wiring mesh ingest into the real bridge. **adapter.js**: `handleBridgeMessage(payload, options)` with optional unwrappers for Telegram/Discord/generic envelopes and optional `handleRequest` to answer mesh_request from local cache. **webhook-server.js**: minimal HTTP server (POST /ingest, POST /bridge, GET /health) so channel traffic can be forwarded to it for mesh ingest. **bridge/README.md**: how to call the adapter from your bot or run the webhook and POST to it; env vars; sending mesh messages. OPENCLAW_MAC_MINI_CEO_PROMPTS.md §4: new subsection on mesh memory/skills on the same bridge with link to bridge README.

## [0.4.6] — 2026-02-27

### Added
- **mesh/** — Phase 1 reference implementation for OpenClaw Mesh (PRD): message formats (FR-1.1, FR-1.2), local cache (FR-1.3), and optional request/response over bridge (FR-1.4). Includes: `messages.js` (create/validate memory and skill messages, request/response helpers), `cache.js` (read/write `~/.openclaw/mesh-memory.json` and `~/.openclaw/mesh/skills/`), `bridge-ingest.js` (parse bridge payloads and ingest into cache), JSON schemas in `schemas/`, `request-response.md` convention, and `mesh/README.md` with usage and tool paths.

## [0.4.5] — 2026-02-27

### Added
- **PRD.md** — Product Requirements Document for OpenClaw Mesh knowledge and skills sharing. Formalizes the design in OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md: problem statement, goals, scope, phased functional requirements (Phase 1: bridge + structured messages, Phase 2: shared store, Phase 3: local-first sync), non-functional requirements, data conventions, risks, and mesh topology diagram. README link to PRD.

## [0.4.4] — 2026-02-27

### Added
- **OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md** — Research and design for sharing knowledge (skills) and shared memory between two or more OpenClaw nodes (mesh). Covers: research summary (SEDM, SHIMI, D³MAS, agent mesh protocols, CRDT/sync), design options (bridge-channel messages, shared store, mesh sync service, registry over bridge), recommended phased approach (Phase 1: bridge + structured messages, Phase 2: shared store, Phase 3: local-first CRDT sync), what to put in shared memory vs skills, and integration with two-node, CEO→Sec bridge, and Mission Control. README link to the new mesh knowledge/skills doc.

## [0.4.3] — 2026-02-27

### Added
- **Overview cards editable:** Each Overview gateway card has an edit button (pencil icon). Clicking it opens the same modal as "Add Gateway" in edit mode (title "Edit Gateway", ID read-only). Saving updates the gateway (name, WebSocket URL, Control UI URL) and persists to localStorage; Overview and Gateways table re-render.

## [0.4.2] — 2026-02-27

### Added
- **Mission Control dashboard (deep):** Stats strip (jobs running/queued/done/failed, tasks active/pending, approvals). **Currently Working** panel (agent + task + progress per gateway). **Tasks** panel (pending, in progress, done, blocked). **Jobs** panel (type, status, gateway, duration). **Working Against** panel (deadlines, blockers, targets). **Pending Approvals** panel (exec approvals with Approve/Deny). **Recent Activity** feed (events + gateway). Per-gateway detail sidebar extended with Working, Tasks, Jobs, Nodes.

## [0.4.1] — 2026-02-27

### Added
- **mission-control/** — Reference implementation of the Mission Control dashboard: single-page app (HTML/CSS/JS) with Overview cards, Gateways table (sortable), per-gateway detail sidebar, bridge status, and Add Gateway modal. Includes animations: staggered card enter, status pulse, scan line, floating header, hover lift/glow, modal slide-in.

## [0.4.0] — 2026-02-27

### Added
- **OPENCLAW_MISSION_CONTROL_DASHBOARD.md** — Design for a Mission Control dashboard aggregating two (and more) OpenClaw gateways: architecture (mermaid), config schema (gateways array, optional bridge), UI sections (overview, gateways table, per-gateway detail, bridge status, add/edit gateway), security (tokens, gateway access, TLS), add-node flow, and reference implementation options (SPA + WebSocket, backend proxy, launcher + links).
- README link to the new Mission Control dashboard design doc.

## [0.3.1] — 2026-02-27

### Changed
- **Architecture correction:** CEO = Mac Mini OpenClaw, Sec = Synology DS1621xs+ OpenClaw (two separate instances). Updated [OPENCLAW_MAC_MINI_CEO_PROMPTS.md](OPENCLAW_MAC_MINI_CEO_PROMPTS.md) with split prompts (CEO on Mac Mini, Sec on Synology), two agent tables and bindings by instance, and new section **CEO → Sec delegation (cross-gateway)** documenting bridge channel, webhook/API, and custom bridge service options. Quick reference updated for delegation to Sec via bridge.
- [OPENCLAW_TWO_NODE_MAC_NAS_DESIGN.md](OPENCLAW_TWO_NODE_MAC_NAS_DESIGN.md): Added cross-reference in Option B to prompts doc and CEO/Sec roles.
- [OPENCLAW_NAS_MACMINI_FEB2026.md](OPENCLAW_NAS_MACMINI_FEB2026.md): Added cross-reference (CEO on Mac Mini; Sec on Synology) to prompts doc.

## [0.3.0] — 2026-02-27

### Added
- **OPENCLAW_MAC_MINI_CEO_PROMPTS.md** — Complete SOUL.md prompts for Mac Mini as main (CEO) NAS with Sec (CEO Executive Assistant): copy-paste prompts for Sec, Research, Coding, Notes, Trading, Family; agent → prompt mapping; bindings and agentToAgent config; quick reference for delegation.
- README link to the new Mac Mini CEO prompts doc.

## [0.2.0] — 2026-02-27

### Added
- **OPENCLAW_TWO_NODE_MAC_NAS_DESIGN.md** — System design for running OpenClaw on Mac Mini + Synology DS1621xs+ (Docker). Includes research summary (OpenClaw cluster model, Mac Mini, DS1621xs+ specs, Docker requirements), Option A (one cluster: Gateway on Mac + Node on NAS), Option B (two independent instances), network/security notes, and decision guide.
- README link to the new two-node Mac + NAS design doc.

## [0.2.0] — 2026-02-27

### Added
- OPENCLAW_NAS_MACMINI_FEB2026.md — OpenClaw Feb 2026 best setup: DS1621xs+ (Docker) + Mac mini (gateway on NAS, Ollama on Mac mini; config, network, hardware tiers, all-in-one alternative).
- README.md: link to new NAS + Mac mini cookbook entry.

## [0.1.0] — 2026-02-27

### Added
- Initial project setup and cookbook structure.
- README.md with project overview and link to cookbook.
- OPENCLAW_CEO_SUBAGENTS_SETUP.md — OpenClaw as Company CEO with Sub-Agents (Feb 2026 best setup).
