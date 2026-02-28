# OpenClaw Two-Node System: Mac Mini + Synology DS1621xs+ (Docker)

A research-based system design for running OpenClaw across a **Mac Mini** and a **Synology DS1621xs+** (Docker). Covers both **one cluster** (Gateway + Node) and **two independent instances**.

**Last updated:** February 2026

---

## 1. Research Summary

### 1.1 OpenClaw Architecture (Official)

- **Gateway (control plane):** Single process per host. Owns channels (Telegram, WhatsApp, etc.), WebSocket server, sessions, bindings, and the Control UI. Binds to `127.0.0.1:18789` by default (loopback).
- **Node host:** Companion device that connects to the Gateway via WebSocket with `role: "node"`. Executes `system.run` / `system.which` (and optionally canvas/camera) on that machine. Does **not** run the gateway.
- **Cluster model:** One Gateway + multiple Node Hosts. Nodes connect over LAN, [Tailnet](https://tailscale.com), or **SSH tunnel** when the gateway is loopback-only.

References: [OpenClaw Nodes](https://docs.openclaw.ai/nodes), [Network model](https://docs.openclaw.ai/gateway/network-model), [Multi-Server Cluster](https://dev.to/linou518/openclaw-guide-ch9-multi-server-cluster-deployment-4h72), [Building an OpenClaw Cluster (Mac Studio + DGX + Windows)](https://medium.com/@dorangao/building-an-openclaw-cluster-one-control-plane-with-multiple-nodes-mac-studio-dgx-windows-3aadf66ae337).

### 1.2 Mac Mini as Host

- **Role:** Ideal for running the **Gateway** (and optionally a local node). Good CPU/RAM, always-on capable, native Docker Desktop or native OpenClaw install.
- **Docker on Apple Silicon:** Use ARM64 images when possible; for x86 use Rosetta 2 in Docker Desktop. Allocate 6–8 GB RAM (16 GB Mac) or 16 GB (32 GB Mac) for containers.
- **Reference:** [Running Docker on OpenClaw Mac Mini (2026)](https://openclawn.com/openclaw-mac-mini-docker-performance/), Docker Desktop resource settings.

### 1.3 Synology DS1621xs+

- **Specs:** Intel Xeon D-1527, 8 GB DDR4 (some units expandable). 6-bay NAS, DSM 7.x, **Container Manager** (Docker).
- **Docker:** Container Manager runs Docker; no hard published memory limit for the NAS itself, but 8 GB total RAM means conservative allocation (e.g. 2–4 GB for OpenClaw gateway container, or ~1–2 GB for a node-only container).
- **Use case:** Reliable, always-on host for either (1) a **second OpenClaw instance** (gateway in Docker) or (2) a **Node Host** that runs commands on the NAS (backups, file ops, cron).

### 1.4 OpenClaw Docker Requirements (from docs)

- **Minimum:** 2 GB RAM for image build; Docker Engine + Docker Compose v2.
- **Gateway in Docker:** Writes config to `~/.openclaw/` and `~/.openclaw/workspace` on the host; Control UI at `http://127.0.0.1:18789/`.
- **Node host:** Can run headless (`openclaw node run --host <gateway> --port 18789`); token from gateway config for auth. No requirement that the node runs in Docker—Docker is optional for the node.

---

## 2. Two Deployment Options

You can run either:

| Option | Mac Mini | DS1621xs+ (Docker) | Use case |
|--------|----------|--------------------|----------|
| **A — One cluster** | Gateway (+ optional local node) | **Node host only** | Single OpenClaw; agents run code on the NAS via the node. |
| **B — Two instances** | OpenClaw #1 (gateway, e.g. native or Docker) | OpenClaw #2 (gateway in Docker) | Two fully separate OpenClaw setups (e.g. personal vs work). |

---

## 3. Option A — One Cluster: Gateway on Mac Mini, Node on DS1621xs+

One control plane on the Mac; the NAS is an execution node for `system.run` (and optional tools).

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Mac Mini                                                        │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  OpenClaw Gateway (control plane)                           │ │
│  │  - Channels (Telegram, WhatsApp, …)                         │ │
│  │  - Bindings, agents, sessions                                │ │
│  │  - Control UI http://127.0.0.1:18789                        │ │
│  │  - Optional: local node (this Mac)                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │
         │  WebSocket (SSH tunnel or Tailscale)
         │  OPENCLAW_GATEWAY_TOKEN
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DS1621xs+ (Synology) — Container Manager (Docker)                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  OpenClaw Node Host (headless)                               │ │
│  │  - openclaw node run --host <mac> --port 18789               │ │
│  │  - Executes system.run / system.which on NAS                 │ │
│  │  - Exec approvals: ~/.openclaw/exec-approvals.json            │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Mac Mini Setup (Gateway)

1. **Install OpenClaw** (native preferred for best UX, or Docker):
   - Native: follow [Quick Start](https://clawdocs.org/getting-started/quick-start).
   - Docker: from OpenClaw repo run `./docker-setup.sh` (or use Docker only for agent sandbox; gateway on host).
2. **Onboard and configure** agents, bindings, channels (e.g. CEO + sub-agents; see [OPENCLAW_CEO_SUBAGENTS_SETUP.md](OPENCLAW_CEO_SUBAGENTS_SETUP.md)).
3. **Get gateway token** for node auth:
   - From gateway config, e.g. `~/.openclaw/openclaw.json` → `gateway.auth.token`.
   - Or: `docker compose run --rm openclaw-cli dashboard --no-open` if gateway runs in Docker.
4. **Expose gateway to NAS (choose one):**
   - **SSH tunnel (recommended if gateway is loopback):** On the NAS (or a machine that can SSH to the Mac), run:
     ```bash
     ssh -N -L 18790:127.0.0.1:18789 user@mac-mini.local
     ```
     Node then connects to `127.0.0.1:18790` on that machine. If the node runs in Docker on the NAS, run the tunnel on the NAS and point the container to the host’s `127.0.0.1:18790` (see below).
   - **Tailscale:** Install Tailscale on both Mac and NAS; on Mac run gateway with `--bind tailnet` and token; node uses the Mac’s Tailscale IP and port 18789.

### 3.3 DS1621xs+ Setup (Node Host in Docker)

1. **Container Manager:** Install/enable Docker (Container Manager) on the NAS.
2. **OpenClaw CLI on NAS:** The node host needs the OpenClaw CLI. Options:
   - **Option 1 — Node in Docker:** Use an image that includes OpenClaw (e.g. build from official repo with Node.js, run `openclaw node run …` as CMD). Persist `~/.openclaw` (e.g. volume or bind mount) for `node.json` and `exec-approvals.json`.
   - **Option 2 — Node on NAS host (if you have shell access):** Install Node.js and OpenClaw CLI on DSM (or via Entware), then run `openclaw node run --host <gateway-host> --port 18789 --display-name "NAS Node"` (use gateway host via SSH tunnel or Tailscale IP).
3. **Gateway token:** Set on the node host:
   ```bash
   export OPENCLAW_GATEWAY_TOKEN="<gateway-token>"
   openclaw node run --host 127.0.0.1 --port 18790 --display-name "NAS Node"
   ```
   (Use port 18790 if using the SSH tunnel to the Mac.)
4. **Pair the node:** On the Mac (gateway host):
   ```bash
   openclaw nodes pending
   openclaw nodes approve <requestId>
   openclaw nodes list
   ```
5. **Exec allowlist (on NAS node):** From the Mac, allow commands that the agent may run on the NAS:
   ```bash
   openclaw approvals allowlist add --node <id|name> "/usr/bin/rsync"
   openclaw approvals allowlist add --node <id|name> "/volume1/scripts/backup.sh"
   ```
6. **Point exec at NAS node (on Mac):** In gateway config or per session:
   ```bash
   openclaw config set tools.exec.host node
   openclaw config set tools.exec.node "NAS Node"
   ```

### 3.4 Resource Suggestion (Option A)

- **Mac Mini:** Reserve 2–4 GB RAM for OpenClaw gateway (and browser/sandbox if used).
- **DS1621xs+:** 1–2 GB for the node container (headless, no UI).

---

## 4. Option B — Two Independent OpenClaw Instances

Two separate OpenClaw deployments: one on the Mac Mini, one on the NAS (Docker). No shared gateway; separate configs, channels, and agents. Example: Mac Mini = CEO instance, Synology = Sec (CEO Executive Assistant) instance; see [OPENCLAW_MAC_MINI_CEO_PROMPTS.md](OPENCLAW_MAC_MINI_CEO_PROMPTS.md) for prompts and CEO→Sec delegation.

### 4.1 Architecture

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│  Mac Mini                           │     │  DS1621xs+ (Docker)                  │
│  OpenClaw Instance #1               │     │  OpenClaw Instance #2                │
│  - Gateway + UI                     │     │  - Gateway in container               │
│  - Agents, channels, bindings       │     │  - Agents, channels, bindings         │
│  - e.g. Personal / primary         │     │  - e.g. Work / backup / automation   │
└─────────────────────────────────────┘     └─────────────────────────────────────┘
         Separate configs, no cluster.
```

### 4.2 Mac Mini — Instance #1

- Install OpenClaw (native or Docker).
- Configure agents, channels, bindings as needed.
- Control UI: `http://127.0.0.1:18789/` (or your bind).
- Config: `~/.openclaw/` (or Docker mounts).

### 4.3 DS1621xs+ — Instance #2 (Docker)

1. **SSH or DSM terminal** on the NAS; clone OpenClaw and run Docker setup:
   ```bash
   git clone https://github.com/openclaw/openclaw.git
   cd openclaw
   ./docker-setup.sh
   ```
   Ensure the NAS has at least **2 GB RAM** free for the build and run (8 GB total → cap other containers).
2. **Persist config:** Use bind mounts or `OPENCLAW_HOME_VOLUME` so `~/.openclaw` and workspace survive restarts (see [Docker install](https://docs.openclaw.ai/install/docker)).
3. **Port:** Map container 18789 to a host port (e.g. 18789) in Container Manager so you can open the Control UI as `http://<nas-ip>:18789/` from your LAN.
4. **Onboard:** Run onboarding in the container:
   ```bash
   docker compose run --rm openclaw-cli onboard
   ```
5. **Channels and agents:** Configure separately from the Mac instance (different Telegram bots, etc.).

### 4.4 Resource Suggestion (Option B)

- **Mac Mini:** Same as Option A (2–4 GB for OpenClaw).
- **DS1621xs+:** 3–4 GB for the **gateway** container (build + runtime); avoid running many other heavy containers at once.

---

## 5. Network and Security

| Topic | Recommendation |
|-------|----------------|
| **Gateway on loopback** | Use SSH tunnel or Tailscale for node/gateway link; do not bind gateway to 0.0.0.0 unless you add auth and lock down access. |
| **Token** | Keep `OPENCLAW_GATEWAY_TOKEN` and `gateway.auth.token` out of version control; use env vars or secrets. |
| **NAS UI (Option B)** | Restrict access to `http://<nas>:18789` (firewall, VPN, or reverse proxy with auth). |
| **Exec on node** | Use allowlist and approvals; only allow necessary commands on the NAS node. |
| **Tailscale** | Simplifies Mac ↔ NAS connectivity and avoids opening ports. |

---

## 6. Decision Guide

- **One logical OpenClaw, with code running on the NAS (backups, scripts, file ops):** Use **Option A** (Gateway on Mac, Node on DS1621xs+).
- **Two completely separate OpenClaw setups (e.g. personal vs work, or prod vs lab):** Use **Option B** (two gateways: Mac + NAS Docker).

You can later add a **second node** (e.g. another Mac or Linux box) to the same gateway by repeating the node setup and pairing steps.

---

## 7. References

- [OpenClaw — Nodes](https://docs.openclaw.ai/nodes)
- [OpenClaw — Network model](https://docs.openclaw.ai/gateway/network-model)
- [OpenClaw — Docker install](https://docs.openclaw.ai/install/docker)
- [OpenClaw Guide Ch9: Multi-Server Cluster Deployment](https://dev.to/linou518/openclaw-guide-ch9-multi-server-cluster-deployment-4h72)
- [Building an OpenClaw Cluster (Mac Studio + DGX + Windows)](https://medium.com/@dorangao/building-an-openclaw-cluster-one-control-plane-with-multiple-nodes-mac-studio-dgx-windows-3aadf66ae337)
- [Raise The OpenClaw — CEO + Sub-Agents](OPENCLAW_CEO_SUBAGENTS_SETUP.md)
- [clawdocs.org — Getting started](https://clawdocs.org/getting-started/quick-start)
