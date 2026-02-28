# Army of OpenClaw — Registry and Dispatcher

Reference implementation for the [Army of OpenClaw](OPENCLAW_ARMY_OF_OPENCLAW.md): **personnel registry** (discovery) and **dispatcher** (order routing and delivery). Uses the same SQLite store as the mesh ([mesh/store](mesh/store/)); no OpenClaw gateway protocol change.

## What it does

- **Registry:** Register gateways/agents with rank, unit, skills, and optional `ingest_url` (bridge webhook). Query nodes by skill, unit, or status.
- **Orders:** POST an order (addressee = gatewayId, unit, or role/skill); dispatcher resolves target, sends order as a mesh memory message to the target's `ingest_url`, and tracks status (pending → in_progress; completion via PATCH or report_up).
- **Mission Control:** Dashboard can call the Army API for Unit view, Roster, and Orders queue (see [mission-control](mission-control/)).

## Run the Army server

Requires a shared store (SQLite) and Node.js. Optional: `better-sqlite3` (same as mesh store).

```bash
# From repo root; use same DB as mesh store (or a dedicated one)
export MESH_STORE_DB_PATH=/path/to/mesh-store.sqlite
node army/server.js 4080

# Optional auth (Bearer) and metrics
ARMY_AUTH_BEARER=secret ARMY_METRICS=1 node army/server.js 4080
```

| Env | Description |
|-----|-------------|
| `MESH_STORE_DB_PATH` | Path to SQLite file (same as mesh store; creates `army_registry` and `army_orders` tables). |
| `PORT` / `ARMY_PORT` | HTTP port (default 4080). |
| `ARMY_AUTH_BEARER` | If set, all `/army/*` requests require `Authorization: Bearer <token>`. |
| `ARMY_REGISTRY_TTL_SEC` | Reserved for future: mark nodes offline after N seconds without heartbeat (default 600). |
| `ARMY_METRICS` | Set to `0` to disable `GET /metrics`. |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service and store availability. |
| POST | `/army/register` | Register a node (body: `gateway_id`, `rank`, `unit`, `skills[]`, optional `agent_id`, `platoon`, `theater`, `status`, `capacity`, `ingest_url`, `model_ranking` array). |
| GET | `/army/nodes` | List nodes. Query: `?skill=`, `?unit=`, `?status=`. |
| GET | `/army/nodes/:id` | Get one node. |
| PATCH | `/army/nodes/:id` | Update node (e.g. `status`, `capacity`, `ingest_url`). |
| GET | `/army/units` | List distinct unit/platoon/theater. |
| POST | `/army/orders` | Submit order. Body: `orderId?`, `type?`, `addressee` (object or string), `payload`, `priority?`, `deadline?`, `from?`, `strategy?` (e.g. `research`, `default`). Optional header `X-Node-Id` for issuer (rank check when auth enabled). Returns 202 + order; dispatcher sends to target and sets status to `in_progress` or `failed`. |
| GET | `/army/orders` | List orders. Query: `?status=pending|in_progress|completed|failed`. |
| PATCH | `/army/orders/:orderId` | Update order (e.g. `status: "completed"`, `result`, `error`) for report_up. |
| GET | `/metrics` | Prometheus-style: `army_orders_total`, `army_orders_failed`, `army_registry_nodes`, `army_dispatcher_queue_depth`, `army_dispatch_errors`. |

## Order flow

1. Command (General) or Mission Control POSTs to `POST /army/orders` with `addressee` (e.g. `{ role: "research" }` or `{ gatewayId: "sec" }`).
2. Server resolves target from registry (by gatewayId, then unit, then role/skill; prefers least loaded).
3. Server sends a **mesh memory message** to the target's `ingest_url`: key `army.order.<orderId>`, value = order payload (includes optional `strategy`). Target node's bridge ingest writes it to local cache; agents can read and execute, then call `PATCH /army/orders/:orderId` with `status: "completed"` and `result`.
4. Mission Control (or General) GETs `GET /army/orders?status=in_progress` and `GET /army/orders?status=completed` to show queue and results.

## References

- [OPENCLAW_ARMY_OF_OPENCLAW.md](OPENCLAW_ARMY_OF_OPENCLAW.md) — Design: ranks, units, orders, registry, dispatcher, resilience.
- [OPENCLAW_ARMY_SOUL_BY_RANK.md](OPENCLAW_ARMY_SOUL_BY_RANK.md) — SOUL prompts per rank.
- [mesh/store/README.md](mesh/store/README.md) — Shared store and schema (army tables live in same DB).
