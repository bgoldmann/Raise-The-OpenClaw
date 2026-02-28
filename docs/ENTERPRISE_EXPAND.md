# Enterprise expand — Multi-tenancy, APIs, rate limits, signing

Design and options for scaling Raise The OpenClaw to multiple tenants, exposing public APIs, and hardening the mesh.

---

## 1. Multi-tenancy

**Mesh:** Introduce an optional `tenant_id` or `org_id` in memory scope, e.g. `user:<tenant>:<id>` or a dedicated scope `tenant:<id>`. Extend the shared store schema with a `tenant_id` column; filter all reads and writes by the authenticated tenant. Nodes authenticate with a tenant-scoped token or API key.

**Mission Control:** Gateways are grouped by tenant. The proxy (or auth layer in front) maps the authenticated user/session to a tenant and returns only gateways for that tenant. Config format: add `tenantId` to each gateway; proxy filters by tenant when serving `/api/gateways` and when multiplexing WebSocket traffic.

---

## 2. Public API for Mission Control

Expose a read-only REST (or OpenAPI) API so other tools can consume gateway status:

- **GET /api/gateways** — Already exists (gateway list without tokens).
- **GET /api/gateways/:id/status** — Aggregated status, agents count, sessions count for that gateway (proxy would call the gateway’s `status` and return it).
- **GET /api/tasks**, **GET /api/jobs** — Aggregated tasks/jobs across gateways (from `sessions.list` and job endpoints).

Implement in the Mission Control proxy; protect with the same auth as the UI (e.g. session cookie or API key).

---

## 3. Public API for mesh store

Implement the [mesh store access model](mesh/store/access-model.md) as an HTTP API: GET/PUT/list for memory and skills, with API key or bearer auth and rate limits. See PRD Phase 2 and access-model.md.

---

## 4. Rate limiting and quotas

- **Bridge webhook:** Limit requests per minute per IP or per API key (e.g. 60/min). Reject with 429 when exceeded. Implement in the webhook server or in a reverse proxy.
- **Mesh store API:** Limit writes per tenant per hour; optional per-key rate limit.

---

## 5. Message signing and verification

For mesh messages over an untrusted or multi-tenant bridge, optional **signing** lets nodes verify origin and integrity:

- **Format:** Add a `sig` (or `signature`) field to each mesh message. Sign the canonical JSON (e.g. type + scope + key + value + nodeId + ts) with the node’s private key (e.g. Ed25519); recipients verify with the node’s public key (distributed out-of-band or via a small registry).
- **Verification:** On ingest, verify `sig` before writing to cache; reject invalid or missing sig when verification is required.

**Documentation and implementation:** See [MESSAGE_SIGNING.md](MESSAGE_SIGNING.md) for canonical payload format, key distribution, and [mesh/signing.js](../mesh/signing.js). Federation hub supports optional `signOutbound` and `verifyInbound` with per-mesh `publicKey`; bridge adapter can call `signing.signMessage` / `verifyMessage` when sending or ingesting.
