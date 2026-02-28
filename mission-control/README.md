# OpenClaw Mission Control Dashboard

Reference implementation of the [Mission Control Dashboard](../OPENCLAW_MISSION_CONTROL_DASHBOARD.md) design. A single-page app that aggregates multiple OpenClaw gateways in one pane-of-glass.

**Single-file SPA:** The dashboard is intentionally one HTML file (HTML + CSS + JS in `index.html`) so you can open it directly in a browser or serve it with any static server—no build step. Section comments in the script mark Overview, Table, Detail, Army, and Modals for easier maintenance.

## Run

**Standalone (direct connect):** Open `index.html` in a browser or serve it:

```bash
open index.html
# Or: npx serve .
```

Gateways are stored in localStorage. Add gateways with WebSocket URL and optional token; the dashboard connects to each gateway using the OpenClaw WebSocket protocol (port 18789) and shows live data when connected.

**With backend proxy (tokens server-side):** Run the proxy, then open the URL it serves:

```bash
cd proxy && npm install && node server.js
# Open http://localhost:3080/
```

The dashboard detects the proxy via `GET /api/gateways`, loads the gateway list (no tokens in the browser), and connects to a single WebSocket at `/ws`. See [proxy/README.md](proxy/README.md).

## Features

- **Live gateway connection** — WebSocket to each gateway (or one to the proxy); OpenClaw handshake (connect.challenge → connect with operator role) and live data (status, agent.list, sessions.list, channels.list, events).
- **LIVE badge** — Shown when at least one gateway is connected.
- **Stats strip** — Jobs (running, queued, done, failed), tasks (active, pending), pending approvals (from live or mock).
- **Overview** — Cards per gateway with status and links to Control UI.
- **Currently Working / Tasks / Jobs / Approvals / Activity** — From live events when connected; otherwise mock data.
- **Gateways table** — Sortable; per-gateway detail sidebar.
- **Bridge status** — CEO ↔ Sec bridge (informational).
- **Add/Edit gateway** — Modal with ID, name, WebSocket URL, Control UI URL, optional token (for direct mode only; use proxy for production).
- **Export** — CSV or JSON export of the gateways table (Export button in header).
- **Customize** — Toggle visibility of panels (Working, Tasks, Jobs, Working Against, Approvals, Activity); persisted in localStorage.

## Animations

- Staggered card entrance, status pulse, scan line, floating header, card hover, sidebar and modal transitions.

## Jobs data contract

Gateway-provided **jobs** (e.g. from live WebSocket or proxy) should have a stable **`id`** (jobId) so the dashboard can display and reference them. When a job is created from an Army order, the job payload should include **`orderId`** so the dashboard can link job ↔ order (e.g. show "Order: ord-123" in the Jobs panel). The dashboard displays job id and optional orderId in each job row.

## Protocol integration

The dashboard implements the OpenClaw Gateway WebSocket protocol: first frame is `connect` (after optional `connect.challenge`); then it calls `status`, `agent.list`, `sessions.list`, `channels.list` and displays results; it also handles events (e.g. `exec.approval.requested`). For gateways that require device auth, use the backend proxy (which can perform pairing once and hold tokens).
