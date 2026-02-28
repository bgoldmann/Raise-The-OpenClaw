# Army of OpenClaw — US Army–Style Design

Design for a **hierarchical, military-style organization** of OpenClaw gateways and agents: chain of command, ranks/roles, units (squad through theater), orders flow, personnel registry (discovery), and Mission Control as the command post. Builds on the existing [mesh](PRD.md), [bridge](bridge/README.md), [federation hub](OPENCLAW_MESH_FEDERATION_HUB.md), and [Mission Control](OPENCLAW_MISSION_CONTROL_DASHBOARD.md) without changing the OpenClaw gateway or agent protocol.

**Last updated:** February 2026

---

## 1. US Army → OpenClaw mapping

| US Army concept | OpenClaw equivalent |
|-----------------|----------------------|
| **Chain of command** | Hierarchy of gateways/agents: orders flow down, reports (task results) flow up. |
| **Rank** | Role/authority: who can issue orders to whom (e.g. General = command node, Colonel = theater lead, Captain = gateway owner, Sergeant = squad lead agent, Specialist = specialist agent). |
| **Unit** | Grouping of gateways or agents: Squad (one gateway + its agents), Platoon (several gateways under one lead), Company/Battalion (mesh or region), Theater (federation of meshes). |
| **MOS (Military Occupational Specialty)** | **Skill descriptor**: what this node/agent can do (research, coding, triage, etc.) — see [OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md](OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md) and [mesh request-response](mesh/request-response.md). |
| **Orders** | **Structured task**: type, priority, addressee (unit or role), payload, deadline; sent over bridge or via dispatcher. |
| **Personnel roster** | **Registry**: which gateways/agents exist, their rank, unit, and capabilities; supports “who can do X?” and “send order to 2nd Squad.” |
| **Command post** | **Mission Control** extended with: unit view, roster, orders queue, optional missions (campaigns). |
| **Logistics / intel** | **Mesh memory and skills**: shared context, procedures, SOUL/skills (already in place). |

Memory (intel) can be **pushed via the Federation Hub** (store or `POST /federation/share`), then shared to the internal mesh and optionally to external meshes. **Rank and unit/theater** control who may push and who may receive. See [OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md](OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md).

---

## 2. Hierarchy and units (structure)

```mermaid
flowchart TB
  subgraph command [Command]
    CO[Command Node - General]
  end
  subgraph theater [Theater - Corps/DIV]
    M1[Mesh A - Colonel]
    M2[Mesh B - Colonel]
  end
  subgraph battalion [Battalion - Mesh A]
    P1[Platoon 1 - Captain]
    P2[Platoon 2 - Captain]
  end
  subgraph platoon [Platoon 1]
    S1[Squad 1 - Sergeant]
    S2[Squad 2 - Sergeant]
  end
  subgraph squad [Squad 1]
    G1[Gateway 1 + agents]
  end
  CO -->|orders| M1
  CO -->|orders| M2
  M1 -->|orders| P1
  M1 -->|orders| P2
  P1 -->|orders| S1
  P1 -->|orders| S2
  S1 -->|tasks| G1
```

- **Command node:** Single gateway (or Mission Control–designated “commander”) that issues orders to theater/mesh leads. Today this can be the **CEO** gateway ([OPENCLAW_MAC_MINI_CEO_PROMPTS.md](OPENCLAW_MAC_MINI_CEO_PROMPTS.md)).
- **Theater:** A **mesh** or **federation**. Colonel = mesh lead (one gateway designated as lead for that mesh).
- **Battalion / Company:** Logical grouping of gateways inside a mesh (e.g. by region or function). Optional; can be a tag on gateways.
- **Platoon:** Small group of gateways (e.g. 2–4) with a **platoon lead** gateway that receives orders and delegates to its squads.
- **Squad:** One **gateway** plus its agents (e.g. Sec + agents). Sergeant = default or “squad lead” agent on that gateway.
- **Soldier:** An **agent** on a gateway (e.g. Research, Coding, Sec). Specialist/Private by role.

Implementation can start **flat**: Command → Squads (gateways). Add Platoon/Battalion/Theater as **tags** (e.g. `unit`, `platoon`, `theater`) in the registry and in orders for routing.

---

## 3. Ranks and roles (authority and capability)

- **Rank** (authority): Who can give orders to whom. Stored in registry per gateway or agent (e.g. `rank: "captain"`). Rules: General can order anyone; Colonel within theater; Captain within battalion; Sergeant within platoon; Specialist/Private receive orders only.
- **Role / MOS** (capability): What this node can do — from existing **skill descriptors** ([OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md](OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md) §2.4, Option D). E.g. `skills: ["research", "triage", "coding"]`. Used for **task routing**: “Send research task → any node with skill research and capacity.”
- **Unit assignment:** Each gateway (and optionally agent) has `unit`, `platoon`, `theater`. Orders can be addressed to `unit: "squad-2"` or `role: "research"` or `gatewayId: "sec"`.

No change to OpenClaw agent model; ranks and units are **metadata** in the registry and in SOUL/context as needed.

---

## 4. Orders (task format and flow)

- **Order:** Structured message (over bridge or dispatcher) with at least: `orderId`, `type` (e.g. task, query, report-request), `addressee` (gatewayId, unit, or role), `payload` (task text, params), `priority`, `deadline`, `from` (issuer node/id).
- **Flow:** Command (or any authorized node) **issues order** → **Dispatcher** or bridge **routes** to addressee(s). Addressee gateway/agent **executes** and **reports** (result) back via bridge or store. Reports consumed by Mission Control and by the issuer.
- **Existing bridge:** Today CEO posts a task to the bridge and Sec receives it ([OPENCLAW_MAC_MINI_CEO_PROMPTS.md](OPENCLAW_MAC_MINI_CEO_PROMPTS.md) §4). Orders generalize this: same bridge (or dedicated “orders” channel), with a **structured envelope** (orderId, addressee, payload, priority) so a **dispatcher** or receiving gateway can route and track.

**Order data shape (reference):**

| Field | Type | Description |
|-------|------|-------------|
| `orderId` | string | Unique id for tracking. |
| `type` | string | e.g. `task`, `query`, `report-request`. |
| `addressee` | object or string | `gatewayId`, or `unit`, or `role` (skill/capability). |
| `payload` | object or string | Task text, params, context. |
| `priority` | string or number | e.g. `high`, `normal`, `low` or 1–5. |
| `deadline` | number (optional) | Unix timestamp. |
| `from` | string | Issuer node or gateway id. |
| `ts` | number | Unix timestamp. |

---

## 5. Personnel registry (discovery)

- **Purpose:** “Who exists, where are they, what can they do?” so the command post and dispatcher can route orders.
- **Contents (per “soldier” = gateway or agent):** id, gatewayId, agentId (optional), rank, unit, platoon, theater, skills (list), status (available, busy, offline), optional capacity (e.g. max tasks).
- **Population:** Manual config at first (e.g. in Mission Control gateway list plus optional rank/unit/skills). Later: gateways **register** on startup (POST to registry API) and **advertise** skill descriptors (periodically or on change); registry stores and indexes them.
- **Implementation option A:** New service or extension of mesh store: `army/registry` table or API (`GET /army/units`, `GET /army/nodes?skill=research`, `POST /army/register`). Backed by SQLite or existing store schema extension.
- **Implementation option B:** Bridge-based discovery (Option D in [OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md](OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md)): nodes post skill summaries to the bridge; a **registry sidecar** ingests and maintains the roster.

**Registry row (reference):**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique roster id. |
| `gatewayId` | string | OpenClaw gateway id (matches Mission Control). |
| `agentId` | string (optional) | Agent on that gateway, if registering per-agent. |
| `rank` | string | e.g. `general`, `colonel`, `captain`, `sergeant`, `specialist`, `private`. |
| `unit` | string | e.g. `squad-1`, `2nd-platoon`. |
| `platoon` | string (optional) | Platoon id. |
| `theater` | string (optional) | Mesh or theater id. |
| `skills` | string[] | Capability list (e.g. research, coding, triage). |
| `status` | string | `available`, `busy`, `offline`. |
| `capacity` | number (optional) | Max concurrent tasks. |
| `updated_at` | number | Unix timestamp. |

---

## 6. Dispatcher (task router)

- **Role:** Receives **orders** from Command (or any authorized issuer); looks up **registry** for addressee (by unit, role, or gatewayId); selects target(s); **sends task** to the right bridge channel or gateway webhook; optionally **tracks** (orderId → status, result) and **retries** or **failover** if target is down or busy.
- **Placement:** New component (e.g. `army/dispatcher.js` or part of Mission Control proxy): subscribes to “orders” or is called by Command gateway (tool that POSTs order to dispatcher). Dispatcher uses registry + routing rules (e.g. “research → any node with skill research, least loaded”) and posts to bridge or gateway ingest.
- **Resilience:** If target unavailable, dispatcher can try next candidate (same role/unit) or queue order and retry; optional timeout and dead-letter (store failed orders for review). See §8 below.

---

## 7. Mission Control as command post

- **Current:** Mission Control already aggregates gateways, tasks, jobs, approvals, activity ([OPENCLAW_MISSION_CONTROL_DASHBOARD.md](OPENCLAW_MISSION_CONTROL_DASHBOARD.md)).
- **Army extensions (design):**
  1. **Unit view:** Group gateways by unit/platoon/theater and show hierarchy.
  2. **Roster:** Tab or panel showing registry (nodes, rank, unit, skills, status).
  3. **Orders queue:** List of orders (pending, in progress, completed, failed) and ability to issue a new order (form: addressee, payload, priority).
  4. **Missions:** Optional “mission” = named set of orders with a goal; show progress (e.g. 3/5 completed).

Data source: registry API + dispatcher API (or store where dispatcher writes order state).

---

## 8. Resilience (failover, timeout, dead-letter)

- **Failover:** When dispatcher sends an order to a node (by role or unit), if that node is offline or returns error, dispatcher selects next candidate from registry (same role/unit, status available) and retries. Optional max retries per order.
- **Timeout:** Orders may have a `deadline`. Dispatcher or command post marks order as failed or timed out when deadline passes without result; optional escalation (e.g. notify or reassign).
- **Dead-letter:** Failed or timed-out orders can be written to a store (e.g. `army/orders_deadletter` table or queue) for human review or replay. Dispatcher exposes optional `GET /army/orders?status=failed` or similar.

---

## 9. References and related docs

| Doc | Purpose |
|-----|---------|
| [PRD.md](PRD.md) | Mesh, shared memory, skills, federation hub. |
| [OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md](OPENCLAW_FEDERATION_HUB_INTEL_SHARE.md) | Intel share: memory via hub (store or share endpoint); rank/unit/theater push and receive. |
| [OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md](OPENCLAW_MESH_KNOWLEDGE_SKILLS_SHARING.md) | Discovery, skill descriptors, Option D registry over bridge. |
| [mesh/request-response.md](mesh/request-response.md) | Request/response over bridge (memory/skill). |
| [OPENCLAW_MAC_MINI_CEO_PROMPTS.md](OPENCLAW_MAC_MINI_CEO_PROMPTS.md) | CEO → Sec delegation, bridge, task flow. |
| [OPENCLAW_MESH_FEDERATION_HUB.md](OPENCLAW_MESH_FEDERATION_HUB.md) | Federation hub; theater = mesh. |
| [OPENCLAW_MISSION_CONTROL_DASHBOARD.md](OPENCLAW_MISSION_CONTROL_DASHBOARD.md) | Mission Control; command post extensions. |

---

## 10. Summary

- **Army of OpenClaw** = hierarchical organization of gateways/agents with **chain of command**, **ranks/roles**, **units** (squad → platoon → theater), **orders** (structured tasks), **personnel registry** (discovery), and **dispatcher** (routing + optional failover).
- **Mission Control** becomes the **command post** (unit view, roster, orders queue, optional missions).
- This document is **design only**. Implementation (registry service, dispatcher, Mission Control UI changes) is separate. No OpenClaw gateway or agent protocol change required.
