# OpenClaw Bridge — Wire mesh into your real bridge

This folder lets you **wire mesh ingest** into your existing CEO↔Sec bridge (Telegram/Discord channel or webhook). When the bridge receives a message, mesh memory and skill messages are parsed and written to the local cache on that node.

## Two ways to wire

### 1. Call the adapter from your bridge code

If you have a script or service that receives bridge messages (e.g. Telegram bot, Discord bot, or webhook handler), require the adapter and call it on each incoming message:

```js
const path = require('path');
const { handleBridgeMessage } = require(path.join(__dirname, 'bridge/adapter.js'));

// When your bridge receives a message:
function onBridgeMessage(payload) {
  const result = handleBridgeMessage(payload, {
    unwrap: 'telegram',        // or 'discord' or 'generic', or a custom function(payload) => body
    handleRequest: true,       // optional: answer mesh_request from local cache
    nodeId: 'ceo',            // this node's id (for mesh_response)
    openclawDir: process.env.OPENCLAW_HOME,
  });
  console.log('Mesh ingested:', result.ingested, 'memory:', result.memory, 'skill:', result.skill);
  if (result.response) {
    // Send result.response back on the bridge (e.g. post to channel or reply to webhook).
    sendBackOnBridge(result.response);
  }
}
```

- **payload** — Raw body from your transport (e.g. Telegram update object, Discord event, or plain JSON string/object).
- **unwrap** — How to get the mesh message from the envelope:
  - `'telegram'` — uses `update.message.text` or `update.channel_post.text`
  - `'discord'` — uses `body.content` or `body`
  - `'generic'` — uses `payload.body` or `payload.message` or `payload`
  - Or pass a function `(payload) => body` for custom envelopes.
- **handleRequest** — If the message is a `mesh_request`, the adapter looks up the local cache and sets **result.response** (a `mesh_response` object). Your code should send that back on the bridge so the requester can ingest it.

### 2. Run the webhook server and POST to it

If you prefer not to change your bridge code, run the small webhook server and forward bridge traffic to it:

```bash
# From the Raise The OpenClaw repo (or set OPENCLAW_HOME if mesh cache lives elsewhere)
node bridge/webhook-server.js 4077
# Or: PORT=4077 MESH_NODE_ID=sec node bridge/webhook-server.js
```

Then:

- **POST /ingest** — Send the mesh message(s) as JSON in the body (single object or array). The server ingests into the local cache and returns `{ ingested, memory, skill }`.
- **POST /bridge** — Send the full bridge envelope (e.g. Telegram update). Use query params:
  - `?unwrap=telegram` or `?unwrap=discord` or `?unwrap=generic` to unwrap the message.
  - `?handleRequest=true` to answer `mesh_request` from local cache; the JSON response will include a `response` field (the `mesh_response` to send back).

**Example: forward Telegram updates to the webhook**

If your Telegram bot receives updates via webhook, add a step that also POSTs to the mesh ingest server (same host or another node):

```bash
curl -X POST http://localhost:4077/bridge?unwrap=telegram -H "Content-Type: application/json" -d @telegram-update.json
```

Or from a small script: when you receive a Telegram update, `POST` it to `http://localhost:4077/bridge?unwrap=telegram`. Optionally, if the response has `response`, post that JSON back to the Telegram chat (e.g. as a message so the other node can ingest it).

## Environment

| Variable | Used by | Meaning |
|----------|---------|---------|
| `OPENCLAW_HOME` | adapter, webhook-server | Override `~/.openclaw` for mesh cache (mesh-memory.json, mesh/skills/). |
| `PORT` | webhook-server | Port for the HTTP server (default 4077). |
| `MESH_NODE_ID` | webhook-server | This node’s id when replying to mesh_request (default `local`). |

## Sending mesh messages on the bridge

- **From CEO (Mac Mini):** Use your existing “post to bridge” tool/script. Send a **JSON string** that is a mesh message, e.g.:
  - Memory: `{"type":"memory","scope":"mesh","key":"user.preferences","value":{"shortAnswers":true},"nodeId":"ceo","ts":1739123456}`
  - Skill: `{"type":"skill","name":"triage","sourceNode":"ceo","content":"# Triage rules\n..."}`
- **From Sec (Synology):** Same idea: when Sec (or a tool) wants to share memory/skill, post that JSON to the bridge channel or webhook. The other node’s adapter or webhook server will ingest it when it receives the message.

## Relation to CEO → Sec delegation

The same channel or webhook you use for **tasks** (CEO → Sec) can carry **mesh messages**. Task messages (e.g. “Task: …”) are handled by OpenClaw and Sec as today. Mesh messages (JSON with `type: "memory"` or `type: "skill"`) are ingested by this adapter into the local mesh cache. So:

- Keep posting tasks as you do now.
- Add posting of mesh JSON when you want to share memory or skills; ensure the receiving side runs the adapter (or POSTs to the webhook server) so those messages are ingested.

See [OPENCLAW_MAC_MINI_CEO_PROMPTS.md §4](../OPENCLAW_MAC_MINI_CEO_PROMPTS.md#4-ceo--sec-delegation-cross-gateway) for bridge options (channel vs webhook vs custom service).

## Files

| File | Purpose |
|------|---------|
| **adapter.js** | `handleBridgeMessage(payload, options)` — call from your bridge handler. |
| **webhook-server.js** | Standalone HTTP server: POST /ingest, POST /bridge, GET /health. |
| **README.md** | This file. |

The **mesh** message formats and cache live in [../mesh/](../mesh/) (see [mesh/README.md](../mesh/README.md)).
