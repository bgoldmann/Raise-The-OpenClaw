# Enterprise security — Raise The OpenClaw

This document describes security options and hardening for Mission Control, the bridge webhook, and the mesh shared store. It aligns with NFR-2 in the [PRD](PRD.md): tokens and secrets not in mesh memory; encryption in transit; access control.

---

## 1. Mission Control

### Tokens and proxy

- **Do not** store gateway tokens in the browser (localStorage) when the dashboard is used on a shared or untrusted network. Use the **Mission Control backend proxy** so tokens exist only on the server.
- **Proxy:** Run `mission-control/proxy/server.js`. Configure gateways via `OPENCLAW_MC_GATEWAYS` (JSON) or a `gateways.json` file (gitignore it). The dashboard is served from the proxy; it fetches `/api/gateways` (no tokens) and connects to `/ws` for live data. See [mission-control/proxy/README.md](mission-control/proxy/README.md).
- **Direct mode:** Acceptable only on a trusted machine (e.g. localhost). Optional token in the Add/Edit gateway form is persisted in localStorage; treat the machine as single-user and locked.

### Access to gateways

- Gateways (OpenClaw on port 18789) are often loopback-only. The dashboard or proxy must reach them via **SSH tunnel**, **Tailscale**, or by binding the gateway to a restricted interface with auth.
- For production, run the proxy behind **HTTPS** (reverse proxy with TLS termination) and restrict who can access it (VPN, IP allowlist, or auth in front).

### TLS for dashboard

- Serve the dashboard over HTTPS in production. Use a reverse proxy (e.g. nginx, Caddy) with a valid cert, or put the proxy behind a cloud load balancer with TLS.

---

## 2. Bridge webhook

### Optional authentication

The bridge webhook server (`bridge/webhook-server.js`) supports optional auth so only trusted callers can POST to `/ingest` and `/bridge`:

| Env var | Purpose |
|--------|---------|
| `BRIDGE_AUTH_HEADER` | Header name to check (e.g. `X-API-Key`). |
| `BRIDGE_AUTH_SECRET` | Expected value for that header. |
| `BRIDGE_AUTH_BEARER` | Alternatively: require `Authorization: Bearer <this value>`. |

If **none** of these are set, no auth is enforced (suitable for local/LAN). If **either** (header+secret) or (bearer) is set, POST requests to `/ingest` and `/bridge` must include the correct header; otherwise the server returns **401 Unauthorized**.

**Example (API key):**

```bash
export BRIDGE_AUTH_HEADER=X-API-Key
export BRIDGE_AUTH_SECRET=your-shared-secret
node bridge/webhook-server.js 4077
```

Callers must send: `X-API-Key: your-shared-secret`.

**Example (Bearer):**

```bash
export BRIDGE_AUTH_BEARER=your-bearer-token
node bridge/webhook-server.js 4077
```

Callers must send: `Authorization: Bearer your-bearer-token`.

### TLS for webhook

- The webhook server is HTTP only. For encryption in transit, run it behind a **reverse proxy** (nginx, Caddy, or cloud LB) that terminates TLS and forwards to `localhost:4077`.
- Or bind the Node process to a TLS socket (requires cert and key); for most deployments, a reverse proxy is simpler.

---

## 3. Mesh shared store (Phase 2)

The [mesh store access model](mesh/store/access-model.md) documents:

- **Authentication:** None (private network), API key / bearer token, or mTLS. Document the choice per deployment.
- **Authorization:** Read/write scope by `mesh`, `node`, or `user:<id>`.
- **Encryption in transit:** Use HTTPS for any HTTP API; use a secure channel for file sync.

A reference store API implementation can enforce API key or bearer auth in the same way as the bridge webhook (env-configured secret, 401 on mismatch).

---

## 4. Summary

| Component | Token / secret handling | Auth option | TLS |
|-----------|-------------------------|------------|-----|
| Mission Control UI | No tokens in browser when using proxy | Proxy holds tokens; optional auth in front of proxy | HTTPS via reverse proxy |
| Bridge webhook | N/A | `BRIDGE_AUTH_HEADER`+`BRIDGE_AUTH_SECRET` or `BRIDGE_AUTH_BEARER` | HTTPS via reverse proxy |
| Mesh store API | No secrets in mesh memory (NFR-2) | API key / bearer / mTLS per access-model | HTTPS for API |
