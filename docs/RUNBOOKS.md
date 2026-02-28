# Runbooks — Raise The OpenClaw

Short procedures for common operations.

---

## Add a new gateway (Mission Control)

**Direct mode (local):**

1. Open Mission Control (e.g. `mission-control/index.html` or `npx serve mission-control`).
2. Click **Add Gateway**. Fill: **ID** (e.g. `lab`), **Name**, **WebSocket URL** (e.g. `ws://lab-host:18789`), **Control UI URL** (optional), **Token** (if required).
3. Save. The dashboard connects to the new gateway; if the gateway requires device auth, use the proxy instead.

**Proxy mode:**

1. Edit gateway config: set `OPENCLAW_MC_GATEWAYS` or update `mission-control/proxy/gateways.json` (or the file pointed to by `OPENCLAW_MC_CONFIG`).
2. Add one object: `{ "id": "lab", "name": "Lab", "wsUrl": "ws://lab-host:18789", "token": "…", "controlUiUrl": "http://lab-host:18789" }`.
3. Restart the proxy: `cd mission-control/proxy && node server.js`.
4. Reload the dashboard in the browser.

---

## Rotate gateway token

**Direct mode:** Edit the gateway in the dashboard (Edit), enter the new token, Save. The new token is stored in localStorage.

**Proxy mode:** Update the token in `OPENCLAW_MC_GATEWAYS` or in the proxy config file. Restart the proxy. No change in the browser.

---

## Recover mesh store / cache

- **Local cache** (Phase 1): Stored in `~/.openclaw/mesh-memory.json` and `~/.openclaw/mesh/skills/` (or under `OPENCLAW_HOME`). To recover from backup, restore those paths. If missing, the mesh will recreate empty state; re-sync from peers or bridge traffic.
- **Shared store** (Phase 2): If using SQLite, restore from a backup of the DB file. If using file sync, restore the shared directory from backup.

---

## Scale bridge ingest

- Run multiple instances of the webhook server behind a load balancer if you need higher throughput. Use the same auth (shared secret or bearer) on all instances. Mesh cache is per-process; for a single logical node, run one webhook and scale the bridge channel (e.g. multiple consumers) instead, or use a single webhook with a queue in front.
- For multiple mesh nodes, run one webhook per node (each with its own `OPENCLAW_HOME` or `MESH_NODE_ID`); point bridge traffic to the appropriate node’s webhook.

---

## Enable bridge webhook auth

1. Choose API key or Bearer:
   - **API key:** `export BRIDGE_AUTH_HEADER=X-API-Key` and `export BRIDGE_AUTH_SECRET=your-secret`.
   - **Bearer:** `export BRIDGE_AUTH_BEARER=your-token`.
2. Restart the webhook server.
3. Update all callers (Telegram/Discord webhook URLs or forwarder scripts) to send the header (`X-API-Key: your-secret` or `Authorization: Bearer your-token`).

See [ENTERPRISE_SECURITY.md](../ENTERPRISE_SECURITY.md).

---

## Add external mesh (Federation Hub)

1. Edit the federation hub config (`config.json` or file in `FEDERATION_HUB_CONFIG`). Add an entry to `externalMeshes`:
   - `meshId` — unique id (e.g. `mesh-b`) for provenance.
   - `endpoint` — URL of the external mesh’s federation endpoint (e.g. `https://other.example.com/federation/in`).
   - `direction` — `inbound`, `outbound`, or `both`.
   - `apiKey` — secret for **inbound** auth (they send `X-Mesh-Id` + `Authorization: Bearer <apiKey>` or `X-API-Key`).
   - `outboundBearer` — (optional) token to send when **outbound** POSTing to their endpoint.
   - `allowedInboundScopesKeys` — (optional) allow-list of scope or `scope:key` for inbound.
2. Restart the federation hub: `node server.js` (or your process manager).
3. Ensure the other mesh has your hub’s URL and your `apiKey` (or shared secret) so they can call `POST /federation/in` with `X-Mesh-Id` and auth.

See [federation-hub/README.md](../federation-hub/README.md) and [OPENCLAW_MESH_FEDERATION_HUB.md](../OPENCLAW_MESH_FEDERATION_HUB.md).

---

## Rotate federation API key

1. Generate a new secret (e.g. `openssl rand -hex 32`).
2. Update the federation hub config: set the new value in `externalMeshes[].apiKey` (for their inbound calls to you) and/or `externalMeshes[].outboundBearer` (for your outbound calls to them).
3. Restart the federation hub.
4. Update the other mesh’s config so they use the new secret when calling your hub (inbound) or so they accept your new token (outbound). Coordinate to avoid downtime (e.g. add new key, then remove old after cutover).

---

## Deploy mesh store API

1. Create the SQLite DB and apply schema: `sqlite3 /path/to/mesh-store.sqlite < mesh/store/schema.sql` (or use the schema in [mesh/store/schema.sql](../mesh/store/schema.sql)).
2. Set `MESH_STORE_DB_PATH=/path/to/mesh-store.sqlite`. Optional: `MESH_STORE_AUTH_HEADER=X-API-Key` and `MESH_STORE_AUTH_SECRET=secret`, or `MESH_STORE_AUTH_BEARER=token`.
3. Run the API server: `node mesh/store/api-server.js 4078` (or `MESH_STORE_PORT=4078`).
4. Point the federation hub at it: set `internal.storeApiUrl` to `http://host:4078` and optionally `internal.storeAuth` (Bearer token) for outbound polling.

See [mesh/store/README.md](../mesh/store/README.md) and [mesh/store/access-model.md](../mesh/store/access-model.md).

---

## Point federation hub at new bridge or store

- **New internal bridge URL:** Update `internal.bridgeWebhookUrl` in the hub config and restart the hub. Inbound traffic will be forwarded to the new URL.
- **New store URL:** Update `internal.storeApiUrl` and optionally `internal.storeAuth`. Restart the hub so outbound polling uses the new store.
