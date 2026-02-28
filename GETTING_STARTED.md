# Get started A to Z

Step-by-step setup for **Raise The OpenClaw**: clone, run the dashboard, and optionally run mesh + bridge. Assumes you have **Node.js** (v18+) and a browser.

---

## 1. Prerequisites

| Requirement | Purpose |
|-------------|---------|
| **Node.js** (v18 or later) | Run bridge webhook server and mesh/store client (optional). Check: `node -v` |
| **Git** | Clone the repo. Check: `git --version` |
| **Browser** | Open Mission Control dashboard (Chrome, Firefox, Safari, Edge) |
| **OpenClaw** (optional) | To use gateways for real: install OpenClaw on your machine(s) per [clawdocs.org](https://clawdocs.org). Raise The OpenClaw works as docs + reference code without OpenClaw; Mission Control uses mock data until you connect real gateways. |

---

## 2. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/RaiseTheOpenClaw.git
cd RaiseTheOpenClaw
```

(Replace `YOUR_USERNAME` with your GitHub username or org.)

---

## 3. Run Mission Control dashboard (no install)

The dashboard is a single HTML file. No `npm install` needed.

**Option A — Open directly in browser**

```bash
open mission-control/index.html
# Or on Linux: xdg-open mission-control/index.html
```

**Option B — Serve over HTTP (recommended if you hit CORS or want a URL)**

```bash
npx serve mission-control
```

Then open **http://localhost:3000** (or the URL shown). You’ll see the dashboard with mock CEO + Sec gateways. Add or edit gateways via the UI; they’re stored in your browser’s localStorage.

---

## 4. Use mesh + bridge (optional)

If you want to share **mesh memory and skills** between nodes and wire the **bridge** (e.g. Telegram/Discord):

### 4.1 Mesh — no extra install

The `mesh/` and `bridge/` code use only Node built-ins. From the repo root:

```bash
# Quick test: create a memory message and read cache
node -e "
const path = require('path');
const m = require('./mesh/messages.js');
const c = require('./mesh/cache.js');
const msg = m.createMemoryMessage({ scope: 'mesh', key: 'test', value: { ok: true }, nodeId: 'local' });
console.log(JSON.stringify(msg, null, 2));
c.writeMeshMemoryEntry({ scope: 'mesh', key: 'test', value: { ok: true }, nodeId: 'local', ts: Math.floor(Date.now()/1000) }, process.env.OPENCLAW_HOME || require('os').homedir() + '/.openclaw');
console.log('Cache:', c.getMeshMemory('mesh', 'test', process.env.OPENCLAW_HOME || require('os').homedir() + '/.openclaw'));
"
```

Cache is written under `~/.openclaw/` (or `OPENCLAW_HOME`): `mesh-memory.json` and `mesh/skills/`.

### 4.2 Bridge webhook server

Run the small HTTP server that ingests mesh messages from POSTs (e.g. from your Telegram/Discord bot or a forwarder):

```bash
node bridge/webhook-server.js 4077
```

- **Health:** `curl http://localhost:4077/health`
- **Ingest a mesh message:**  
  `curl -X POST http://localhost:4077/ingest -H "Content-Type: application/json" -d '{"type":"memory","scope":"mesh","key":"prefs","value":{},"nodeId":"ceo","ts":'$(date +%s)'}'`

Optional env vars: `OPENCLAW_HOME`, `PORT`, `MESH_NODE_ID`. See [bridge/README.md](bridge/README.md).

### 4.3 Wire the adapter into your bot

If you have a Telegram or Discord bot (or any webhook handler), require the bridge adapter and call it on each message. See [bridge/README.md](bridge/README.md) for `handleBridgeMessage(payload, { unwrap: 'telegram' })` and options.

---

## 5. Phase 2 shared store (optional)

If you use a **central SQLite store** (e.g. on a NAS):

1. Create the DB and apply schema:
   ```bash
   sqlite3 /path/to/mesh-store.sqlite < mesh/store/schema.sql
   ```
2. Install the optional client (from repo root):
   ```bash
   npm init -y
   npm install better-sqlite3
   ```
3. Use `mesh/store/client.js`: `openStore(dbPath)`, `syncStoreToLocalCache(dbPath, openclawDir)`. See [mesh/store/README.md](mesh/store/README.md).

---

## 6. Phase 3 sync (optional)

Use the sync module to build summaries, compute requests, and merge deltas (last-write-wins). No extra install; optional hashes use Node `crypto`. See [mesh/sync/README.md](mesh/sync/README.md).

```bash
node -e "
const path = require('path');
const sync = require('./mesh/sync/sync.js');
const summary = sync.buildSummary('ceo', process.env.OPENCLAW_HOME, { includeHash: true });
console.log(JSON.stringify(summary, null, 2));
"
```

---

## 7. Full CEO + Sec setup (OpenClaw required)

For a real two-node setup (e.g. CEO on Mac Mini, Sec on Synology):

1. **Install OpenClaw** on both machines per official docs ([clawdocs.org](https://clawdocs.org)).
2. **Configure CEO (Mac Mini):** Use [OPENCLAW_MAC_MINI_CEO_PROMPTS.md](OPENCLAW_MAC_MINI_CEO_PROMPTS.md): copy SOUL.md prompts, bindings, agentToAgent. Give CEO a tool or script to post tasks to the bridge (Telegram/Discord or webhook).
3. **Configure Sec (Synology):** Same doc — Sec SOUL.md, bindings. Connect the Synology gateway to the **same** bridge channel so Sec receives tasks from CEO.
4. **Bridge:** Create a private Telegram group (or Discord channel) and add both bots; or run a webhook that forwards to the Sec instance. See [OPENCLAW_MAC_MINI_CEO_PROMPTS.md §4](OPENCLAW_MAC_MINI_CEO_PROMPTS.md#4-ceo--sec-delegation-cross-gateway).
5. **Mesh (optional):** On each node, run the bridge adapter when messages arrive, or run the bridge webhook server and POST bridge traffic to it so mesh memory/skills are ingested into each node’s `~/.openclaw/` cache.
6. **Mission Control:** Open the dashboard, add your gateways (WebSocket + Control UI URLs), and optionally point the bridge webhook at `http://your-mission-control-host:4077/bridge` if you run the webhook server there.

---

## 8. Verify

| What | How |
|------|-----|
| Mission Control | Open dashboard → see overview cards and gateways table (mock or real). |
| Mesh cache | `cat ~/.openclaw/mesh-memory.json` (or `OPENCLAW_HOME/mesh-memory.json`) after ingesting a memory message. |
| Bridge webhook | `curl http://localhost:4077/health` → `{"ok":true,...}`. |
| OpenClaw gateways | Mission Control connects via WebSocket; ensure gateways are reachable and CORS/ports allow the dashboard origin. |

---

## 9. Next steps

- **[PRD](PRD.md)** — Mesh product requirements and phases.
- **[CEO + Sec prompts](OPENCLAW_MAC_MINI_CEO_PROMPTS.md)** — Copy-paste SOUL.md and bridge options.
- **[Mission Control design](OPENCLAW_MISSION_CONTROL_DASHBOARD.md)** — Dashboard architecture and config.
- **[bridge/README.md](bridge/README.md)** — Adapter and webhook server in detail.
- **[mesh/README.md](mesh/README.md)** — Message formats, cache layout, Phase 2 store, Phase 3 sync.
