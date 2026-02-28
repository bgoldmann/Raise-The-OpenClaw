# OpenClaw Mission Control Dashboard

Reference implementation of the [Mission Control Dashboard](../OPENCLAW_MISSION_CONTROL_DASHBOARD.md) design. A single-page app that aggregates multiple OpenClaw gateways in one pane-of-glass.

## Run

Open `index.html` in a browser:

```bash
open index.html
```

Or serve it over HTTP:

```bash
npx serve .
```

## Features

- **Stats strip** — Jobs (running, queued, done, failed), tasks (active, pending), pending approvals
- **Overview** — Cards per gateway with status, last seen, and links to Control UI
- **Currently Working** — What each agent is doing (agent, task, progress %, gateway)
- **Tasks** — Task list with status: pending, in progress, done, blocked
- **Jobs** — Job queue (type, status, gateway, duration)
- **Working Against** — Deadlines, blockers, and targets (constraints to keep in view)
- **Pending Approvals** — Exec approvals with Approve/Deny (operator.approvals scope)
- **Recent Activity** — Event timeline with time and gateway
- **Gateways table** — Sortable by name, ID, agents, sessions, channels
- **Per-gateway detail** — Sidebar: agents, sessions, channels, working, tasks, jobs, nodes
- **Bridge status** — CEO ↔ Sec bridge informational section
- **Add gateway** — Modal form to add new gateways (persisted in localStorage)

## Animations

- Staggered card entrance on load
- Pulsing status indicators for connected/error
- Scan line sweep across the viewport
- Subtle floating header
- Card lift + glow on hover
- Sidebar slide-in and section stagger
- Modal scale + fade on open

## Data

Uses mock data by default (CEO + Sec gateways). Gateway list is stored in localStorage. Connect real gateways by implementing the OpenClaw WebSocket protocol (port 18789) in the JS layer.
