# Mission Control backend proxy

Holds gateway URLs and **tokens server-side** so the browser never sees them. Serves the Mission Control dashboard and multiplexes one WebSocket to the frontend while maintaining connections to each OpenClaw gateway.

## Run

```bash
cd mission-control/proxy
npm install
node server.js [port]
# Or: PORT=3080 node server.js
```

Default port: **3080**. Open http://localhost:3080/ — the dashboard will detect the proxy (via `/api/gateways`) and connect to `/ws` for live data.

## Config

**Option 1 — env**

```bash
export OPENCLAW_MC_GATEWAYS='[{"id":"ceo","name":"CEO (Mac Mini)","wsUrl":"ws://mac-mini.local:18789","token":"YOUR_TOKEN","controlUiUrl":"http://127.0.0.1:18789"},{"id":"sec","name":"Sec (Synology)","wsUrl":"ws://192.168.1.60:18789","token":"YOUR_SEC_TOKEN","controlUiUrl":"http://192.168.1.60:18789"}]'
node server.js
```

**Option 2 — config file**

Create `gateways.json` in this directory (or set `OPENCLAW_MC_CONFIG` to its path):

```json
{
  "gateways": [
    { "id": "ceo", "name": "CEO (Mac Mini)", "wsUrl": "ws://mac-mini.local:18789", "token": "…", "controlUiUrl": "http://127.0.0.1:18789" },
    { "id": "sec", "name": "Sec (Synology)", "wsUrl": "ws://192.168.1.60:18789", "token": "…", "controlUiUrl": "http://192.168.1.60:18789" }
  ]
}
```

Add `gateways.json` to `.gitignore` so tokens are not committed.

**Optional — Federation hub (Mesh & Federation panel):** Set `OPENCLAW_MC_FEDERATION_HUB_URL` to the hub base URL (e.g. `http://localhost:4080`). The dashboard will show "Mesh & Federation" with hub status when in proxy mode.

**Optional — Army (Command Post panel):** Set `OPENCLAW_MC_ARMY_URL` to the Army server base URL (e.g. `http://localhost:4080`). The dashboard will show "Army — Command Post" with Unit view, Roster, Orders queue, and Issue order form. Requests to `/api/army/*` are proxied to the Army server.

## Endpoints

| Path | Description |
|------|-------------|
| `GET /` | Mission Control dashboard (static) |
| `GET /ws` | WebSocket — connect for live gateway data (client receives `{ gatewayId, ...frame }`) |
| `GET /api/gateways` | List gateways (no tokens) — used by dashboard to detect proxy mode |
| `GET /api/federation/health` | Federation hub health (when `OPENCLAW_MC_FEDERATION_HUB_URL` is set); 404 if not configured |
| `GET /api/army/*`, `POST /api/army/*`, `PATCH /api/army/*` | Proxied to Army server (when `OPENCLAW_MC_ARMY_URL` is set) |
| `GET /health` | Health check |

## Security

- Tokens exist only in server env or `gateways.json`; they are never sent to the browser.
- For production, run behind HTTPS and restrict access (VPN, auth reverse proxy, or network policy).
