# Product Requirements: Raise The OpenClaw — Expansion (Phase 2)

**Version:** 0.1 (draft)  
**Status:** Draft  
**Parent PRD:** [PRD.md](PRD.md) (OpenClaw Mesh — Shared Knowledge and Skills)  
**Design sources:** [docs/ENTERPRISE_EXPAND.md](docs/ENTERPRISE_EXPAND.md), [OPENCLAW_MESH_FEDERATION_HUB.md](OPENCLAW_MESH_FEDERATION_HUB.md), [mesh/store/access-model.md](mesh/store/access-model.md)

---

## 1. Overview

This PRD defines **expansion options and functions** for Raise The OpenClaw: completing already-designed features (federation outbound, mesh store HTTP API, message signing), enterprise and scale (multi-tenancy, rate limiting, public APIs), and new capabilities (Mission Control mesh/federation view, runbooks, optional CLI, observability). All items are **additive** to the existing mesh, bridge, Mission Control, and federation hub—no OpenClaw gateway protocol change.

---

## 2. Glossary

| Term | Definition |
|------|-------------|
| **Mesh store HTTP API** | HTTP service that exposes GET/PUT/list for mesh memory and skills per [mesh/store/access-model.md](mesh/store/access-model.md); enables federation hub outbound (poll), tools, and multi-node access without file sync. |
| **Federation outbound** | Federation hub sending selected mesh memory/skills from the internal mesh to configured external mesh endpoints; filtered by scope or allow-list, optionally signed. |
| **Message signing** | Optional `sig` field on mesh messages (e.g. Ed25519 over canonical JSON); verification on ingest for untrusted or multi-tenant bridges. |
| **Multi-tenancy** | Optional isolation by `tenant_id` or `org_id`: mesh memory/scopes and Mission Control gateways filtered by tenant; auth maps caller to tenant. |
| **Rate limiting** | Cap on requests per time window (e.g. per IP or API key); 429 when exceeded. |

---

## 3. Problem Statement

| | Description |
|--|-------------|
| **Current state** | Mesh (Phase 1–3), bridge, Mission Control, and federation hub (inbound only) are implemented. Several designed features are not yet built; operators lack a single store API, full federation (outbound), and optional enterprise/scale features. |
| **Pain** | Federation is one-way (inbound only); no standard HTTP API for the mesh store; no signing for untrusted bridges; no tenant isolation or public read-only APIs for automation; limited runbooks and observability for federation. |
| **Desired state** | Expand the system with store API, federation outbound, optional signing, and (as needed) multi-tenancy, rate limits, public APIs, Mission Control mesh/federation view, runbooks, and optional CLI—with clear requirements and priority. |

---

## 4. Goals and Success Criteria

**Goals**

1. **Complete designed features:** Federation hub outbound, mesh store HTTP API, message signing (per ENTERPRISE_EXPAND).
2. **Enterprise and scale:** Optional multi-tenancy, rate limiting, and public read-only APIs where documented.
3. **Operability and visibility:** Runbooks for federation and store; optional Mission Control mesh/federation view; federation hub metrics.
4. **Optional extensions:** CLI or admin tool for mesh; future optional semantic/vector memory (design only).

**Success criteria**

- Mesh store HTTP API: at least one reference server implementing access-model endpoints; federation hub can poll it for outbound.
- Federation outbound: hub can send filtered memory/skills to configured external mesh endpoints (store poll or bridge copy).
- Message signing: optional sign on send, verify on ingest (bridge and federation hub); documented payload and key distribution.
- Runbooks: add external mesh, rotate federation API key, deploy store API; federation hub metrics and health.

---

## 5. User Personas / Stakeholders

| Persona | Need |
|---------|------|
| **Mesh operator** | Deploy store API, run federation outbound, inspect mesh/federation from Mission Control; runbooks and metrics. |
| **External integrator** | Call mesh store API (read/write memory/skills) or Mission Control public API (gateway status, tasks, jobs) with auth. |
| **Multi-tenant operator** | Isolate mesh and Mission Control by tenant; rate limits and signing for untrusted bridges. |
| **Raise The OpenClaw reader** | Single PRD for expansion scope and requirements; implementation order and references. |

---

## 6. Scope

| In scope | Out of scope |
|----------|--------------|
| Mesh store HTTP API (reference server per access-model). | Changing OpenClaw gateway or node protocol. |
| Federation hub outbound (poll store or bridge copy; filter; optional sign; POST to external). | Changing mesh message formats beyond optional `sig`. |
| Message signing and verification (optional; bridge + federation hub). | Mandatory signing or new crypto schemes. |
| Multi-tenancy (mesh scope + Mission Control proxy filter); rate limiting (bridge, store API). | Full identity provider or SSO. |
| Mission Control public API (read-only gateway status, tasks, jobs); Mission Control mesh/federation view. | Mission Control protocol changes. |
| Runbooks (federation, store API, hub metrics); federation hub metrics/health. | Full SRE playbooks. |
| Optional mesh CLI / admin tool; optional semantic/vector memory (design only). | Production vector DB or embedding service in this PRD. |

---

## 7. Functional Requirements

### 7.1 Mesh store HTTP API

| ID | Requirement |
|----|-------------|
| **FR-EXP-1.1** | **Endpoints.** HTTP server exposes: GET `/mesh/memory?scope=...` (list), GET `/mesh/memory/:scope/:key` (get), PUT `/mesh/memory` (body: scope, key, value, node_id); GET `/mesh/skills`, GET `/mesh/skills/:name`, PUT `/mesh/skills`. Response shape per [mesh/store/access-model.md](mesh/store/access-model.md). |
| **FR-EXP-1.2** | **Backend.** Server uses existing [mesh/store/client.js](mesh/store/client.js) (SQLite) or equivalent; `updated_at` set on write. |
| **FR-EXP-1.3** | **Auth.** Optional API key or bearer token; 401 when auth configured and missing/invalid. |
| **FR-EXP-1.4** | **Health.** GET `/health` returns 200 and service name. |

### 7.2 Federation hub outbound

| ID | Requirement |
|----|-------------|
| **FR-EXP-2.1** | **Source.** Hub obtains internal messages by (a) polling configured store API (GET memory/skills filtered by scope or allow-list), or (b) receiving a copy of bridge traffic when so configured. |
| **FR-EXP-2.2** | **Filter.** Only data with `scope: "federation"` or in `outboundKeysAllowList` is sent out; config per [OPENCLAW_MESH_FEDERATION_HUB.md](OPENCLAW_MESH_FEDERATION_HUB.md). |
| **FR-EXP-2.3** | **Sign (optional).** If configured, outbound messages include `sig` per [docs/ENTERPRISE_EXPAND.md](docs/ENTERPRISE_EXPAND.md) §5 before POST. |
| **FR-EXP-2.4** | **Send.** POST each filtered message (or batch) to each external mesh `endpoint` with `direction` outbound or both; use existing auth (e.g. bearer) if configured. |

### 7.3 Message signing and verification

| ID | Requirement |
|----|-------------|
| **FR-EXP-3.1** | **Format.** Optional `sig` field on mesh memory and skill messages; canonical serialization (e.g. type, scope, key, value, nodeId, ts) signed with node private key (e.g. Ed25519). |
| **FR-EXP-3.2** | **Bridge.** When signing enabled, bridge adapter (or ingest path) can sign outbound and verify on ingest; config or env to enable. |
| **FR-EXP-3.3** | **Federation hub.** Hub can sign outbound and verify inbound using per-mesh public key; reject invalid or missing sig when verification required. |
| **FR-EXP-3.4** | **Documentation.** Payload format and key distribution (out-of-band or registry) documented. |

### 7.4 Multi-tenancy

| ID | Requirement |
|----|-------------|
| **FR-EXP-4.1** | **Mesh.** Optional `tenant_id` in scope (e.g. `tenant:<id>` or in `user:<tenant>:<id>`); store schema and API filter reads/writes by tenant; nodes authenticate with tenant-scoped token or API key. |
| **FR-EXP-4.2** | **Mission Control.** Gateway config may include `tenantId`; proxy (or auth layer) filters `/api/gateways` and WebSocket traffic by authenticated tenant. |

### 7.5 Rate limiting

| ID | Requirement |
|----|-------------|
| **FR-EXP-5.1** | **Bridge webhook.** Optional limit (e.g. requests per minute per IP or API key); respond 429 when exceeded. |
| **FR-EXP-5.2** | **Mesh store API.** Optional per-tenant or per-key rate limits; 429 when exceeded. |

### 7.6 Mission Control public API and mesh/federation view

| ID | Requirement |
|----|-------------|
| **FR-EXP-6.1** | **Public API.** Read-only REST: GET `/api/gateways/:id/status`, GET `/api/tasks`, GET `/api/jobs` (aggregate from gateways); same auth as UI (session or API key). |
| **FR-EXP-6.2** | **Mesh/federation view.** Optional dashboard section or panel: mesh (e.g. memory/skill counts or store summary) and federation (hub health, connected external meshes); data from store API and/or hub GET `/health` and optional GET `/federation/status`. |

### 7.7 Observability and runbooks

| ID | Requirement |
|----|-------------|
| **FR-EXP-7.1** | **Federation hub metrics.** Optional GET `/metrics` (Prometheus-style: inbound_total, inbound_errors, forward_errors); structured logging for key events. |
| **FR-EXP-7.2** | **Runbooks.** Documented procedures: add external mesh (config + auth), rotate federation API key, deploy mesh store API, recover federation hub config; reference in [docs/RUNBOOKS.md](docs/RUNBOOKS.md). |

### 7.8 Optional extensions

| ID | Requirement |
|----|-------------|
| **FR-EXP-8.1** | **Mesh CLI / admin tool.** Optional CLI or script: read/write mesh memory or skills (local cache or store API); list keys; optionally trigger sync. |
| **FR-EXP-8.2** | **Semantic/vector memory.** Design only: optional layer for mesh memory (embeddings, similarity search); how it fits with scope/key and skills; implementation out of scope for this PRD. |

---

## 8. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| **NFR-EXP-1** | **Backward compatibility:** All expansions are optional; existing mesh, bridge, Mission Control, and federation inbound behavior unchanged when new features disabled. |
| **NFR-EXP-2** | **Security:** Store API and public APIs protected by auth; signing keys not in mesh-shared memory; rate limits to reduce abuse. |
| **NFR-EXP-3** | **Documentation:** Each implemented expansion documented (README or design doc); runbooks updated; [CHANGELOG.md](CHANGELOG.md) updated per project rules. |

---

## 9. Dependencies and Assumptions

**Dependencies**

- Existing mesh (Phase 1–3), bridge, [mesh/store](mesh/store/) schema and client, federation hub (inbound), Mission Control and proxy.
- [mesh/store/access-model.md](mesh/store/access-model.md) and [docs/ENTERPRISE_EXPAND.md](docs/ENTERPRISE_EXPAND.md) as design input.

**Assumptions**

- Store API can be a new server (e.g. Node) using existing store client; federation hub and other consumers call it over HTTP.
- Multi-tenancy and rate limiting are optional; default deployment remains single-tenant without rate limits.

---

## 10. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Store API increases attack surface. | Auth (API key/bearer), optional rate limits, runbook for secure deployment. |
| Federation outbound may leak internal data. | Strict filter (federation scope or allow-list only); no secrets in shared memory. |
| Signing key management. | Document out-of-band or registry; optional feature so operators can defer. |

---

## 11. Implementation Priority (Recommendation)

| Priority | Item | Rationale |
|----------|------|-----------|
| 1 | Mesh store HTTP API (FR-EXP-1.x) | Unblocks federation outbound and integrations. |
| 2 | Federation hub outbound (FR-EXP-2.x) | Completes federation story. |
| 3 | Runbooks + federation hub metrics (FR-EXP-7.x) | Low effort; high operability gain. |
| 4 | Message signing (FR-EXP-3.x) | Important for untrusted/multi-tenant bridges. |
| 5 | Mission Control mesh/federation view (FR-EXP-6.2) | Improves visibility once store/hub data available. |
| 6 | Mission Control public API (FR-EXP-6.1) | For automation and tooling. |
| 7 | Multi-tenancy, rate limiting (FR-EXP-4.x, 5.x) | When scaling to multiple orgs or stricter quotas. |
| 8 | Mesh CLI (FR-EXP-8.1); semantic memory design (FR-EXP-8.2) | When operator convenience or “query by meaning” is needed. |

---

## 12. Army of OpenClaw

**Goals:** Chain of command (orders down, reports up), discovery (“who can do X?”), task routing by unit/role, and resilience (failover, timeout, dead-letter). **Scope:** Personnel registry (gateways/agents with rank, unit, skills, status), structured orders format (orderId, type, addressee, payload, priority, deadline, from), dispatcher (receive orders, lookup registry, route to bridge or webhook, track, optional retry/failover), Mission Control extensions (unit view, roster, orders queue, optional missions). **Out of scope:** No OpenClaw gateway or agent protocol change; implementation of registry service, dispatcher, and Mission Control UI is separate. Full design: [OPENCLAW_ARMY_OF_OPENCLAW.md](OPENCLAW_ARMY_OF_OPENCLAW.md).

---

## 13. References and Related Docs

| Doc | Purpose |
|-----|---------|
| [PRD.md](PRD.md) | Parent PRD: mesh, shared memory, skills, federation hub. |
| [docs/ENTERPRISE_EXPAND.md](docs/ENTERPRISE_EXPAND.md) | Multi-tenancy, public APIs, rate limits, message signing. |
| [OPENCLAW_MESH_FEDERATION_HUB.md](OPENCLAW_MESH_FEDERATION_HUB.md) | Federation hub design and config. |
| [OPENCLAW_ARMY_OF_OPENCLAW.md](OPENCLAW_ARMY_OF_OPENCLAW.md) | Army of OpenClaw: hierarchy, registry, orders, dispatcher, command post. |
| [mesh/store/access-model.md](mesh/store/access-model.md) | Store HTTP API and auth model. |
| [docs/RUNBOOKS.md](docs/RUNBOOKS.md) | Existing runbooks; expansion adds federation and store. |
