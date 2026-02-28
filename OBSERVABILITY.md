# Observability — Raise The OpenClaw

Logging, metrics, health checks, and audit for enterprise operations.

---

## 1. Bridge webhook

### Structured logging

When the bridge webhook server handles a request, it logs one JSON line per request (stderr):

- **Success:** `{"ts":"…","level":"info","msg":"ingest_ok","reqId":"…","ingested":…}` or `"bridge_ok"`.
- **Error:** `{"ts":"…","level":"error","msg":"ingest_error","reqId":"…","error":"…"}`.
- **Auth failure:** `{"ts":"…","level":"warn","msg":"auth_failed","path":"/ingest"}`.

Pipe stderr to a log aggregator or file for search and alerting.

### Metrics

Set `BRIDGE_METRICS=1` (or leave unset; metrics are on by default). Then:

- **GET /metrics** — Prometheus-style text:
  - `bridge_ingest_total` — total POST /ingest requests.
  - `bridge_ingest_errors` — ingest errors.
  - `bridge_bridge_total` — total POST /bridge requests.
  - `bridge_bridge_errors` — bridge errors.

Set `BRIDGE_METRICS=0` to disable metrics and the `/metrics` endpoint.

### Health

- **GET /health** — Returns `{ ok: true, service: "openclaw-bridge-ingest", cacheWritable: true|false }`. `cacheWritable` is false if the mesh cache directory (e.g. `~/.openclaw`) is not writable.

Use for load balancer health checks and alerting.

---

## 2. Mission Control proxy

- **GET /health** — Returns `{ ok: true, service: "mission-control-proxy", gateways: N }`.
- Add structured logging (e.g. log gateway connect/disconnect and client connect) in your deployment if needed.

---

## 3. Audit

- **Gateway config changes:** When using the Mission Control proxy, gateway list changes are done via config (env or file), not in the UI. Track changes with config management (Git, Ansible) or script that logs to your audit sink.
- **Exec approvals:** The dashboard can Approve/Deny exec requests. For audit, log these actions in the backend that implements `exec.approval.resolve` (OpenClaw gateway or a sidecar). Raise The OpenClaw does not implement a central audit API; integrate with your existing audit/logging pipeline.

---

## 4. Retention

- **Bridge logs:** Retain per your policy (e.g. 30–90 days). Rotate log files if writing to disk.
- **Mesh cache:** Stored under `~/.openclaw/` (or `OPENCLAW_HOME`). Back up periodically; retention is application-defined (no automatic purge in the reference implementation).
- **Metrics:** Scrape Prometheus (or equivalent) and define retention in the metrics backend.

---

## 5. Army (registry and dispatcher)

When the [Army server](army/README.md) is running, set `ARMY_METRICS=1` (default) to expose:

- **GET /metrics** — Prometheus-style text:
  - `army_orders_total` — total orders submitted.
  - `army_orders_failed` — orders that ended in failed state.
  - `army_orders_completed` — orders marked completed (via PATCH report_up).
  - `army_registry_nodes` — current number of nodes in the registry (gauge).
  - `army_dispatcher_queue_depth` — count of pending + in_progress orders (gauge).
  - `army_dispatch_errors` — delivery errors (ingest timeout or non-2xx).

Set `ARMY_METRICS=0` to disable. Use for capacity planning and alerting (e.g. alert when `army_orders_failed` increases or `army_registry_nodes` drops).

---

## 6. Alerting

- Alert on `bridge_ingest_errors` or `bridge_bridge_errors` increase.
- Alert on **GET /health** returning non-200 or `cacheWritable: false`.
- Alert on Mission Control proxy **GET /health** non-200.
- Alert on Army `army_orders_failed` spike or `army_registry_nodes` below threshold when Army is in use.
