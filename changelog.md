# Changelog

All notable changes to the Raise The OpenClaw project are documented here.

## [Unreleased]

### Added (Army strategy and job ID)

- **Army order strategy** — Optional `strategy` field on orders (e.g. `research`, `default`, `attack`). Design: [OPENCLAW_ARMY_OF_OPENCLAW.md](OPENCLAW_ARMY_OF_OPENCLAW.md) §4.1; [OPENCLAW_ARMY_STRATEGIES.md](OPENCLAW_ARMY_STRATEGIES.md). Schema: `army_orders.strategy` (mesh/store/schema.sql and client.js with migration for existing DBs). Army server accepts `strategy` in POST body and includes it in the mesh memory message sent to the node. Mission Control: Issue order form has Strategy dropdown; Orders table has Strategy column.
- **Jobs identified by ID; optional orderId** — Gateway-provided jobs should have a stable `id` (jobId); when a job is created from an Army order it should include `orderId`. Mission Control Jobs panel displays job id and optional "Order: …" link. Contract documented in [mission-control/README.md](mission-control/README.md) and [OPENCLAW_MISSION_CONTROL_DASHBOARD.md](OPENCLAW_MISSION_CONTROL_DASHBOARD.md).

### Added (Improvement plan: security, tests, docs, robustness)

- **Security (Mission Control)** — All user- and gateway-sourced strings are escaped with `escapeHtml()` in overview cards, gateways table, detail sidebar, Working/Tasks/Jobs/Against/Approvals/Activity panels, and Army section. Control UI URLs are validated with `safeHttpUrl()` (http/https only) before use in links; `rel="noopener noreferrer"` on external links.
- **Tests** — Node built-in test runner: `test/mesh-messages.test.js` (create/validate/parse memory and skill messages, mesh request/response), `test/mesh-cache.test.js` (memory and skills read/write/ingest with temp dir), `test/bridge-ingest.test.js` (ingestFromBridge, handleBridgeMessage, unwrap telegram, handleRequest), `test/proxy-health.test.js` (Mission Control proxy GET /health and GET /api/gateways). Run with `npm test` or `node --test test/`.
- **Root package.json** — Scripts: `test`, `serve:mc`, `run:bridge`, `run:mesh-cli`; engines Node >=18.
- **Bridge** — Optional `BRIDGE_MAX_BODY_SIZE` (bytes): POST /ingest and /bridge return 413 Payload Too Large when body exceeds limit; Content-Length checked first, then streamed body. [bridge/README.md](bridge/README.md) and webhook-server.js header updated.

### Changed (Improvement plan: docs, maintainability, robustness)

- **Docs** — PRD_EXPANSION.md changelog link unified to `changelog.md` (lowercase). README and GETTING_STARTED clone URL set to canonical repo `https://github.com/bgoldmann/Raise-The-OpenClaw.git` with note for forks.
- **Mission Control** — Single-file SPA documented in [mission-control/README.md](mission-control/README.md); section comments added in index.html (Config and state, WebSocket, Render: stats/overview/table/detail/Army, Modals, Init). Error visibility: `catch (_)` replaced with `console.error`/`console.warn` for proxy check, federation health, Army nodes/orders fetch, and issue-order JSON parse.

### Added (LLM model rankings per rank and per node)

- **OPENCLAW_ARMY_OF_OPENCLAW.md** — §3.2: table "Recommended LLM model(s) by rank" and paragraph on quality/cost and SOUL alignment; §5: registry row field `model_ranking` (optional array of model ids). Per-node `model_ranking` overrides rank default when set.
- **OPENCLAW_ARMY_SOUL_BY_RANK.md** — §1: reference to recommended model(s) by rank in Army doc.
- **Army registry** — Optional `model_ranking` (JSON array of model ids) in schema, store client (registerNode, getNode, listNodes, updateNode), migration for existing DBs, army server (POST /army/register, PATCH /army/nodes/:id), [army/README.md](army/README.md).
- **Mission Control — Army Roster** — New column "Model(s)" showing per-node model ranking when present.

### Added (Army of OpenClaw — implementation)

- **army/** — Reference implementation: registry API (POST /army/register, GET /army/nodes, GET /army/nodes/:id, PATCH /army/nodes/:id, GET /army/units) and dispatcher (POST /army/orders, GET /army/orders, PATCH /army/orders/:orderId). Uses mesh store SQLite (army_registry, army_orders tables). Resolves addressee by gatewayId, unit, or role/skill; sends order as mesh memory message to target ingest_url; failover to next candidate on delivery failure. Optional ARMY_AUTH_BEARER, rank check for order issuance; GET /metrics (army_orders_total, army_orders_failed, army_registry_nodes, army_dispatcher_queue_depth, army_dispatch_errors). [army/README.md](army/README.md).
- **mesh/store** — Army schema and client: army_registry and army_orders tables in schema.sql and client.js (registerNode, getNode, listNodes, listUnits, updateNode, putOrder, getOrder, listOrders, updateOrder, countOrdersByStatus, countInProgressByNode).
- **Mission Control — Army Command Post** — Dashboard section "Army — Command Post" when proxy has OPENCLAW_MC_ARMY_URL: Unit view (group by theater/platoon), Roster table, Orders queue with status filter, Issue order form. Proxy forwards /api/army/* to Army server. [mission-control/proxy/README.md](mission-control/proxy/README.md) updated.
- **OPENCLAW_ARMY_OF_OPENCLAW.md** — Registry freshness (heartbeat/TTL), routing rules (priority, least loaded), §8b Security (order issuer check, audit), order data-flow diagram, escalation (refused/failed orders, who can reassign), reference implementation links.
- **OPENCLAW_ARMY_SOUL_BY_RANK.md** — Refuse-order protocol (report_up with status "refused", reason); Specialist variants Trading (7.5), Family (7.6).
- **OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md** — Optional intel TTL/expiration (value._meta.expiresAt) and classification in data model.
- **OBSERVABILITY.md** — §5 Army metrics (GET /metrics, army_* counters and gauges; alerting note).
- **docs/RUNBOOKS.md** — Add a node to the Army, Issue first order, Recover from dispatcher/registry failure.
- **GETTING_STARTED.md** — §6b Army quick start (run server, register squad, Mission Control, issue order).
- **README.md** — Reference implementations table: army/server.js and Army Command Post in Mission Control.
- **PRD_EXPANSION.md** — §12 Army: reference implementation (army/, Mission Control Army section).

### Added (Army skills and tools per rank)

- **OPENCLAW_ARMY_SOUL_BY_RANK.md** — Copy-paste SOUL prompts per Army rank (General, Colonel, Captain, Sergeant, Specialist): identity, authority, delegation, skills (MOS), tools/constraints; Specialist variants (research, coding, triage, notes); bindings and config notes; references to Army design and intel-share.
- **OPENCLAW_ARMY_OF_OPENCLAW.md** — New §3.2 Skills and tools by rank: tables for registry skills (MOS) by rank and tools by rank (OpenClaw + custom issue_order/report_up); note on shared mesh skills by rank/unit; reference to OPENCLAW_ARMY_SOUL_BY_RANK.md. §9 References: added OPENCLAW_ARMY_SOUL_BY_RANK.md.
- **README.md** — Documentation table: added [Army SOUL by rank](OPENCLAW_ARMY_SOUL_BY_RANK.md).

### Added (30-day X tweet plan)

- **docs/30_DAY_TWEET_PLAN.md** — 30-day X (Twitter) content plan for Raise The OpenClaw: goals, audience, content pillars, calendar (Days 1–30), two ready-to-post tweet drafts, traffic/engagement tips, suggested weekly distribution, and link placeholders for repo/GETTING_STARTED/Mission Control/clawdocs.org.
- **README.md** — Documentation table: added [30-day X tweet plan](docs/30_DAY_TWEET_PLAN.md).

### Changed (30-day X tweet plan)

- **docs/30_DAY_TWEET_PLAN.md** — Replaced placeholders with repo links: https://github.com/bgoldmann/Raise-The-OpenClaw (repo, GETTING_STARTED, Mission Control) in tweet drafts and "Links for tweets" section.
- **docs/30_DAY_TWEET_PLAN.md** — Added @OpenClaw and hashtags to both tweet drafts (#OpenClaw #AIagents #opensource #selfhosted #LocalAI); added @mentions tip and "Suggested tags (X)" section.
- **docs/30_DAY_TWEET_PLAN.md** — Added "All 30 tweet drafts (Day 1–30)": full copy-paste tweets for each day (intro/wonder, how it works, deep dives, use cases, recap/CTA) with repo links, @OpenClaw, and hashtags.

### Added (Federation Hub Intel Share)

- **OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md** — Design for passing memory (intel/logistics) to the Federation Hub via store or `POST /federation/share`, then sharing to internal mesh (bridge/store) and optionally to external meshes; Army-style ranking and unit/theater control who can push and who can receive. Data model: optional `audience`, `targetUnit`, `targetTheater` in wrapper or `value._meta`.
- **Federation hub `POST /federation/share`** — Internal endpoint (auth: `internal.shareSecret` or `internal.shareBearer`). Body: single mesh message, array, or wrapper `{ messages, audience, targetUnit, targetTheater }`. Forwards to internal bridge; optionally writes to store; optional immediate outbound to external meshes. Metrics: `share_total`, `share_errors`.
- **Federation hub store-to-bridge** — When `internal.storeToBridgeIntervalMs` is set, hub periodically reads store (scopes mesh + outboundScope) and skills, builds mesh messages, POSTs to internal bridge so memory written via store API reaches the internal mesh.
- **Federation hub config** — `internal.shareSecret` / `shareBearer`, `registryUrl`, `thisTheater`, `shareWriteToStore`, `shareImmediateOutbound`, `storeToBridgeIntervalMs`; `externalMeshes[].theater`. [federation-hub/README.md](federation-hub/README.md) and config.example.json updated.
- **OPENCLAW_MESH_FEDERATION_HUB.md** — New §3.4 Intel share (internal) with link to OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md; References table updated.
- **OPENCLAW_ARMY_OF_OPENCLAW.md** — §1 Logistics/intel: memory can be pushed via hub (store or share), rank/unit/theater control push and receive; §9 References: link to OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md.
- **README.md** — Reference implementations: federation-hub (share endpoint, store-to-bridge). Documentation table: added [Federation hub intel share](OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md).
- **Diagrams redesigned** — OPENCLAW_MESH_FEDERATION_HUB.md §2 Topology: single diagram now shows internal push sources (Command, Store API), hub with `POST /federation/in`, `POST /federation/share`, store read, store-to-bridge fan-out, forward to bridge, write to store, outbound; external inbound from other meshes. OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md §2 Target flow: diagram updated with store-to-bridge fan-out, Path A (share endpoint) and Path B (store) described; nodes use camelCase IDs and clear edges (poll, optional immediate outbound).

### Added (Army of OpenClaw — design)

- **OPENCLAW_ARMY_OF_OPENCLAW.md** — Design for a US Army–style hierarchy of OpenClaw nodes: chain of command, ranks/roles, units (squad → platoon → theater), orders (structured task format and flow), personnel registry (discovery; schema and population options), dispatcher (task router, placement, resilience), Mission Control as command post (unit view, roster, orders queue, optional missions). Data shapes: registry row and order; references to PRD, OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md, mesh request-response, OPENCLAW_MAC_MINI_CEO_PROMPTS.md, OPENCLAW_MISSION_CONTROL_DASHBOARD.md. Design only; no protocol change.
- **PRD_EXPANSION.md** — New §12 Army of OpenClaw: goals (chain of command, discovery, task routing, resilience), scope (registry, orders format, dispatcher, Mission Control extensions), out of scope (no OpenClaw protocol change); link to OPENCLAW_ARMY_OF_OPENCLAW.md. References table updated with Army design doc.
- **README.md** — Documentation table: added [OPENCLAW_ARMY_OF_OPENCLAW.md](OPENCLAW_ARMY_OF_OPENCLAW.md).

### Added (Federation Hub)

- **OPENCLAW_MESH_FEDERATION_HUB.md** — Design for a Federation Hub that connects your mesh to external meshes: purpose, topology (internal mesh + hub + external meshes), hub responsibilities (inbound/outbound), config schema, scope/allow-list, provenance (`external:<mesh-id>:<node-id>`), and security (filtering, optional signing). Links from OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md and PRD.
- **PRD.md** — Federation: new glossary terms (Federation hub, External mesh, Federation scope, Provenance); optional Federation Hub in scope; new §9 data convention (federation scope/allow-list); §12 extended with second topology diagram (mesh + Federation Hub + external meshes); References link to OPENCLAW_MESH_FEDERATION_HUB.md.
- **federation-hub/** — Reference implementation: Node server with `POST /federation/in` (inbound), optional **outbound** (poll store API by `outboundScope`/allow-list, POST to external meshes), optional message signing (sign outbound, verify inbound per-mesh public key), `GET /metrics` (Prometheus-style). Config: `outboundPollIntervalMs`, `signOutbound`, `verifyInbound`, `privateKeyPath`/`privateKeyEnv`, per-mesh `publicKey`.
- **README.md** — Reference implementations table and Documentation table: added [federation-hub/](federation-hub/) and [OPENCLAW_MESH_FEDERATION_HUB.md](OPENCLAW_MESH_FEDERATION_HUB.md).

### Added (Expansion PRD)

- **PRD_EXPANSION.md** — Product requirements for expansion (Phase 2): mesh store HTTP API, federation hub outbound, message signing, multi-tenancy, rate limiting, Mission Control public API and mesh/federation view, runbooks and federation hub metrics, optional CLI and semantic memory (design). Prioritized implementation order and references to ENTERPRISE_EXPAND, federation hub, and store access-model.
- **README.md** — Documentation table: added [PRD — Expansion](PRD_EXPANSION.md).

### Added (Expansion implementation)

- **mesh/store/api-server.js** — HTTP API for mesh memory and skills (access-model Option A): GET/PUT `/mesh/memory`, GET/PUT `/mesh/skills`, optional auth (API key or Bearer), optional rate limit (`MESH_STORE_RATE_LIMIT_PER_MIN`), GET `/health`. Backend: existing store client (SQLite). [mesh/store/README.md](mesh/store/README.md) updated.
- **Federation hub outbound** — Hub polls `internal.storeApiUrl` for memory (by `outboundScope`) and skills, filters by `outboundKeysAllowList`, converts to mesh messages, POSTs to each external mesh with `direction` outbound/both; optional `outboundBearer` per mesh. Config: `outboundPollIntervalMs`, `storeApiUrl`, `storeAuth`.
- **docs/RUNBOOKS.md** — Runbooks: add external mesh, rotate federation API key, deploy mesh store API, point federation hub at new bridge/store.
- **Federation hub GET /metrics** — Prometheus-style counters: inbound_total, inbound_errors, forward_errors, outbound_ok, outbound_errors. `FEDERATION_HUB_METRICS=0` disables.
- **mesh/signing.js** — Optional Ed25519 message signing: `canonicalMessage`, `signMessage`, `verifyMessage`. **docs/MESSAGE_SIGNING.md** — Payload format, key distribution, key generation; ENTERPRISE_EXPAND §5 updated with link. Federation hub: config `signOutbound`, `verifyInbound`, `privateKeyPath`/`privateKeyEnv`, per-mesh `publicKey`.
- **Mission Control mesh/federation view** — Proxy: `GET /api/federation/health` (when `OPENCLAW_MC_FEDERATION_HUB_URL` set). Dashboard: “Mesh & Federation” section with federation hub status when in proxy mode. [mission-control/proxy/README.md](mission-control/proxy/README.md) updated.
- **Rate limiting** — Bridge webhook: `BRIDGE_RATE_LIMIT_PER_MIN` (per IP or auth key), 429 when exceeded. Mesh store API: `MESH_STORE_RATE_LIMIT_PER_MIN`, 429 when exceeded.
- **Multi-tenancy (Mission Control)** — Proxy: optional `OPENCLAW_MC_TENANT_HEADER`; gateways may include `tenantId`; list filtered by request header. Gateway config and README support tenantId.
- **scripts/mesh-cli.js** — CLI: get-memory, put-memory, list-memory, get-skill, put-skill, list-skills using local cache or store API (`MESH_STORE_URL`). README reference implementations table updated.
- **docs/SEMANTIC_MEMORY_DESIGN.md** — Design-only: optional vector/semantic layer for mesh memory (embeddings, similarity search); fit with scope/key model; implementation out of scope.
- **README.md** — Reference implementations: federation-hub (outbound, metrics, signing), mesh store API server, mesh CLI.

## [0.6.0] — 2026-02-27

### Added (WoW and enterprise expansion)

- **Mission Control — live WebSocket:** Dashboard connects to OpenClaw gateways (port 18789), performs connect.challenge/connect handshake with operator role, fetches status/agent.list/sessions.list/channels.list, and displays live data. LIVE badge when connected; mock data fallback when disconnected. Optional token per gateway (localStorage) for direct mode.
- **Mission Control — backend proxy:** [mission-control/proxy/](mission-control/proxy/) — Node server that holds gateway config and tokens, serves the dashboard, and exposes a single WebSocket (`/ws`) that multiplexes to all gateways. Frontend detects proxy via `GET /api/gateways` and connects to `/ws`; tokens never reach the browser. Config via `OPENCLAW_MC_GATEWAYS` or `gateways.json`. README and gateways.json.example added.
- **Mission Control — export and customize:** Export gateways table as CSV or JSON (Export button in header). Customize: show/hide panels (Working, Tasks, Jobs, Working Against, Approvals, Activity) with persistence in localStorage.
- **Bridge webhook — optional auth:** Env `BRIDGE_AUTH_HEADER`+`BRIDGE_AUTH_SECRET` (API key) or `BRIDGE_AUTH_BEARER`; POST /ingest and /bridge return 401 when auth is configured and missing/invalid. [ENTERPRISE_SECURITY.md](ENTERPRISE_SECURITY.md) and bridge README updated.
- **Bridge webhook — observability:** Structured JSON logging (reqId, path, ingested, error); optional `GET /metrics` (Prometheus-style: ingest_total, ingest_errors, bridge_total, bridge_errors); `GET /health` extended with `cacheWritable` (cache dir writability). `BRIDGE_METRICS=0` disables metrics.
- **ENTERPRISE_SECURITY.md** — Mission Control proxy and tokens, bridge auth and TLS, mesh store access, summary table.
- **OBSERVABILITY.md** — Bridge logging, metrics, health; Mission Control proxy health; audit and retention notes; alerting suggestions.
- **docs/RUNBOOKS.md** — Add gateway, rotate token, recover mesh store, scale bridge ingest, enable bridge auth.
- **DEPLOYMENT.md** — Docker Compose example (Mission Control proxy + bridge), Dockerfile.mc, Kubernetes outline, single-host.
- **docs/ENTERPRISE_EXPAND.md** — Multi-tenancy (mesh + Mission Control), public API for Mission Control and mesh store, rate limiting, message signing (design/options).
- **OPENCLAW_MISSION_CONTROL_DASHBOARD.md** — New §9 Mission Control protocol integration (direct + proxy, export, customize); §10 References with Mission Control and proxy README links.
- **mission-control/README.md** — Updated for live WebSocket, proxy mode, export, customize, protocol integration.

### Changed

- **mission-control/index.html** — Token field in Add/Edit gateway form; LIVE badge; WebSocket connect and live data merge; proxy detection and connectViaProxy; sendReq supports proxy and direct; export dropdown and customize panel visibility; data-panel attributes and applyPanelVisibility.

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
