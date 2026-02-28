# OpenClaw Federation Hub

Reference implementation of the **Federation Hub** that connects your internal OpenClaw mesh to **other meshes** outside your network. Design: [OPENCLAW_MESH_FEDERATION_HUB.md](../OPENCLAW_MESH_FEDERATION_HUB.md).

## What it does

- **Inbound:** Accepts `POST /federation/in` from external meshes (with auth per mesh). Validates and filters messages, rewrites `nodeId`/`sourceNode` to `external:<mesh-id>:<node-id>` (provenance), then forwards to your internal bridge webhook (`/ingest`). Your existing mesh (CEO, Sec, caches) ingests as usual.
- **Outbound:** When `internal.storeApiUrl` is set, the hub periodically polls the store API for memory (by `outboundScope`, e.g. `federation`) and skills, filters by `outboundKeysAllowList` if set, converts to mesh messages, and POSTs to each external mesh with `direction: "outbound"` or `"both"`. Optional `outboundPollIntervalMs` (default 60000); optional `outboundBearer` per external mesh for auth when POSTing to their endpoint.
- **Intel share:** When `internal.shareSecret` or `internal.shareBearer` is set, accepts `POST /federation/share` from internal callers (Command, dispatcher). Forwards to the internal bridge, optionally writes to the store, and optionally sends immediately to external meshes. Optional **store-to-bridge** fan-out (`internal.storeToBridgeIntervalMs`) reads the store and POSTs to the bridge so memory written via the store API also reaches the internal mesh. Design: [OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md](../OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md).

## Quick start

1. Copy `config.example.json` to `config.json`.
2. Set `internal.bridgeWebhookUrl` to your bridge ingest URL (e.g. `http://localhost:4077/ingest`).
3. Add at least one entry in `externalMeshes` with `meshId`, `endpoint`, `direction` (`inbound` or `both`), and `apiKey` (or `bearerToken`) for auth.
4. Run:
   ```bash
   node server.js
   ```
   Or with env: `FEDERATION_HUB_CONFIG=./config.json PORT=4080 node server.js`

## Config

| Field | Description |
|-------|-------------|
| `internal.bridgeWebhookUrl` | **Required.** URL to POST ingested messages (e.g. your bridge `http://host:4077/ingest`). |
| `internal.storeApiUrl` | Optional. Shared store API for outbound and optional share/store-to-bridge. |
| `internal.storeAuth` | Optional. Bearer token for store API. |
| `internal.shareSecret` or `internal.shareBearer` | Optional. Token for `POST /federation/share`; when set, share endpoint is enabled. |
| `internal.registryUrl` | Optional. Army registry base URL for rank check on share. |
| `internal.thisTheater` | Optional. This hub's theater id for filtering share to bridge by `targetTheater`. |
| `internal.shareWriteToStore` | Optional. If true (default when store configured), share endpoint writes each message to store. |
| `internal.shareImmediateOutbound` | Optional. If true, share endpoint immediately POSTs to external meshes for audience federation/both. Default false. |
| `internal.storeToBridgeIntervalMs` | Optional. If set, hub periodically reads store and POSTs to bridge. |
| `externalMeshes[]` | List of external mesh configs. |
| `externalMeshes[].meshId` | Unique id (e.g. `mesh-a`) used for provenance. |
| `externalMeshes[].endpoint` | URL of the external mesh’s federation endpoint (for outbound, when implemented). |
| `externalMeshes[].direction` | `inbound` \| `outbound` \| `both`. |
| `externalMeshes[].apiKey` | Secret for auth; caller sends `X-Mesh-Id` + `Authorization: Bearer <apiKey>` or `X-API-Key: <apiKey>`. |
| `externalMeshes[].allowedInboundScopesKeys` | Optional. Allow-list of scope or `scope:key`; only those are accepted from this mesh. |
| `externalMeshes[].theater` | Optional. External mesh theater id for receive filtering. |
| `outboundScope` | If `federation`, only entries with `scope: "federation"` are sent out. |
| `outboundKeysAllowList` | Optional allow-list of keys for outbound. |

## Inbound API: POST /federation/in

- **Headers:** `X-Mesh-Id: <meshId>` and either `Authorization: Bearer <apiKey>` or `X-API-Key: <apiKey>` (must match the configured external mesh).
- **Body:** JSON — single mesh message or array of messages (same format as [mesh messages](mesh/README.md): `type: "memory"` or `"skill"` with required fields).
- **Response:** `200` with `{ ingested, memory, skill }` (counts forwarded to internal bridge). `401` if auth fails, `400` if body is invalid, `502` if forward to internal bridge fails.

## Share API: POST /federation/share

- **When enabled:** Set `internal.shareSecret` or `internal.shareBearer` in config.
- **Headers:** `Authorization: Bearer <shareSecret or shareBearer>`.
- **Body:** JSON — single mesh message, array of messages, or wrapper `{ "messages": [...], "audience": "both", "targetUnit": "", "targetTheater": "" }`. Same message shape as mesh [memory](mesh/README.md)/skill.
- **Response:** `200` with `{ ingested, memory, skill, storeWritten?, immediateOutbound? }`. `401` if auth fails, `400` if body invalid, `502` if forward to bridge fails.
- **Behavior:** Forwards to internal bridge; if `internal.storeApiUrl` and `shareWriteToStore` not false, writes each message to store; if `shareImmediateOutbound` is true, POSTs messages with audience federation/both to external meshes immediately.

## Health

- `GET /health` or `GET /` returns `200` and `{ ok: true, service: "openclaw-federation-hub" }`.

## References

- [OPENCLAW_MESH_FEDERATION_HUB.md](../OPENCLAW_MESH_FEDERATION_HUB.md) — design, topology, config, security.
- [OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md](../OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md) — intel share (store + share endpoint), Army ranking and unit/theater.
- [PRD.md](../PRD.md) — Federation section and topology diagram.
- [bridge/README.md](../bridge/README.md) — internal bridge and `/ingest`.
