#!/usr/bin/env node
/**
 * OpenClaw Federation Hub — Reference implementation.
 * Receives mesh messages from external meshes at POST /federation/in, applies provenance and filtering,
 * and forwards to the internal bridge webhook. Optional outbound (poll store → POST to external) not included in minimal build.
 *
 * Usage:
 *   node server.js [config-path]
 *   FEDERATION_HUB_CONFIG=./config.json node server.js
 *
 * Config: JSON with internal.bridgeWebhookUrl, externalMeshes[{ meshId, endpoint, direction, apiKey?, allowedInboundScopesKeys? }], etc.
 * See config.example.json and OPENCLAW_MESH_FEDERATION_HUB.md.
 *
 * Endpoints:
 *   POST /federation/in    — Body: JSON (single mesh message or array). Header: X-Mesh-Id + Authorization: Bearer <apiKey> (or X-API-Key).
 *   POST /federation/share — Body: JSON (single message, array, or wrapper { messages, audience, targetUnit, targetTheater }). Header: Authorization: Bearer <shareSecret/shareBearer>. Forwards to bridge; optional write to store; optional immediate outbound.
 *   GET  /health           — 200 OK
 *   GET  /metrics         — Prometheus-style (when FEDERATION_HUB_METRICS != 0)
 */

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const meshDir = path.join(__dirname, '..', 'mesh');
const messages = require(path.join(meshDir, 'messages.js'));
let signing;
try {
  signing = require(path.join(meshDir, 'signing.js'));
} catch {
  signing = null;
}

const PORT = parseInt(process.env.PORT || process.env.FEDERATION_HUB_PORT || '4080', 10);
const configPath = process.env.FEDERATION_HUB_CONFIG || process.argv[2] || path.join(__dirname, 'config.json');
const METRICS_ENABLED = process.env.FEDERATION_HUB_METRICS !== '0';

const metrics = { inboundTotal: 0, inboundErrors: 0, forwardErrors: 0, outboundOk: 0, outboundErrors: 0, shareTotal: 0, shareErrors: 0 };

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT' && (configPath.includes('config.json') || configPath.includes('config.example'))) {
      throw new Error('Config not found. Copy federation-hub/config.example.json to config.json and set internal.bridgeWebhookUrl and externalMeshes.');
    }
    throw e;
  }
}

function log(level, msg, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  console.error(line);
}

/**
 * Resolve external mesh by auth. Expects X-Mesh-Id + Authorization: Bearer <apiKey> or X-API-Key: <apiKey>.
 */
function resolveExternalMesh(config, req) {
  const meshId = req.headers['x-mesh-id'];
  if (!meshId) return null;
  const ext = (config.externalMeshes || []).find((m) => m.meshId === meshId);
  if (!ext || (ext.direction !== 'inbound' && ext.direction !== 'both')) return null;
  const bearer = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  const token = ext.apiKey || ext.bearerToken;
  if (!token) return ext;
  if (bearer && bearer === 'Bearer ' + token) return ext;
  if (apiKey && apiKey === token) return ext;
  return null;
}

/**
 * Check if message is allowed by allowedInboundScopesKeys (allow-list of scope or "scope:key").
 */
function allowInbound(msg, allowedInboundScopesKeys) {
  if (!allowedInboundScopesKeys || allowedInboundScopesKeys.length === 0) return true;
  if (messages.isMemoryMessage(msg)) {
    const scopeKey = msg.scope + ':' + msg.key;
    return allowedInboundScopesKeys.includes(msg.scope) || allowedInboundScopesKeys.includes(scopeKey);
  }
  if (messages.isSkillMessage(msg)) return true;
  return false;
}

/**
 * Rewrite nodeId/sourceNode to external:<meshId>:<original> for provenance.
 */
function applyProvenance(msg, meshId) {
  const out = { ...msg };
  if (messages.isMemoryMessage(out)) {
    out.nodeId = 'external:' + meshId + ':' + (out.nodeId || 'unknown');
  }
  if (messages.isSkillMessage(out)) {
    out.sourceNode = 'external:' + meshId + ':' + (out.sourceNode || 'unknown');
  }
  return out;
}

/**
 * POST JSON to a URL (internal bridge or external). Optional options.headers for Authorization etc.
 */
function postJson(url, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const req = lib.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload, 'utf8'),
          ...options.headers,
        },
        ...options,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ statusCode: res.statusCode, body: data });
          else reject(new Error('HTTP ' + res.statusCode + ': ' + data));
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * GET a URL and parse JSON. Optional Authorization header via options.headers.
 */
function getJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const req = lib.request(
      url,
      { method: 'GET', ...options },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error('Invalid JSON response'));
            }
          } else reject(new Error('HTTP ' + res.statusCode + ': ' + data));
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * PUT JSON to a URL (e.g. store API). Optional options.headers.
 */
function putJson(url, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const req = lib.request(
      url,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload, 'utf8'),
          ...options.headers,
        },
        ...options,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ statusCode: res.statusCode, body: data });
          else reject(new Error('HTTP ' + res.statusCode + ': ' + data));
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Check share endpoint auth. Requires Authorization: Bearer <token> matching internal.shareSecret or internal.shareBearer.
 */
function checkShareAuth(config, req) {
  const internal = config.internal || {};
  const token = internal.shareSecret || internal.shareBearer;
  if (!token) return false;
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer ' + token) return false;
  return true;
}

/**
 * Parse share body: single message, array of messages, or wrapper { messages, audience, targetUnit, targetTheater }.
 * Returns { messages: Array, audience: string, targetUnit: string, targetTheater: string }.
 */
function parseShareBody(body) {
  if (Array.isArray(body)) {
    return { messages: body, audience: 'both', targetUnit: '', targetTheater: '' };
  }
  if (body && typeof body.messages !== 'undefined') {
    const list = Array.isArray(body.messages) ? body.messages : [body.messages];
    return {
      messages: list,
      audience: body.audience || 'both',
      targetUnit: body.targetUnit || '',
      targetTheater: body.targetTheater || '',
    };
  }
  return { messages: [body], audience: 'both', targetUnit: '', targetTheater: '' };
}

/**
 * Apply audience/targetUnit/targetTheater to a message (embed in value._meta for memory messages).
 */
function applyShareEnvelope(msg, audience, targetUnit, targetTheater) {
  const out = { ...msg };
  if (messages.isMemoryMessage(out)) {
    const meta = { ...(out.value && typeof out.value === 'object' && out.value._meta ? out.value._meta : {}) };
    if (audience) meta.audience = audience;
    if (targetUnit) meta.targetUnit = targetUnit;
    if (targetTheater) meta.targetTheater = targetTheater;
    if (out.value && typeof out.value === 'object' && !Array.isArray(out.value)) {
      out.value = { ...out.value, _meta: meta };
    } else {
      out.value = { _value: out.value, _meta: meta };
    }
  }
  return out;
}

/**
 * Write a single mesh message to the store API (PUT /mesh/memory or PUT /mesh/skills).
 */
async function writeMessageToStore(config, msg) {
  const storeUrl = config.internal && config.internal.storeApiUrl;
  if (!storeUrl) return;
  const baseUrl = storeUrl.replace(/\/$/, '');
  const headers = {};
  if (config.internal.storeAuth) {
    headers.Authorization = 'Bearer ' + config.internal.storeAuth;
  }
  try {
    if (messages.isMemoryMessage(msg)) {
      await putJson(baseUrl + '/mesh/memory', {
        scope: msg.scope,
        key: msg.key,
        value: msg.value,
        node_id: msg.nodeId,
      }, { headers });
    } else if (messages.isSkillMessage(msg)) {
      await putJson(baseUrl + '/mesh/skills', {
        name: msg.name,
        source_node: msg.sourceNode,
        content: msg.content,
      }, { headers });
    }
  } catch (e) {
    log('warn', 'federation_share_store_write_failed', { error: e.message, type: msg.type });
  }
}

/**
 * Store-to-bridge: read store (scopes mesh + outboundScope), build messages, POST to internal bridge.
 */
async function runStoreToBridge(config) {
  const storeUrl = config.internal && config.internal.storeApiUrl;
  const bridgeUrl = config.internal && config.internal.bridgeWebhookUrl;
  if (!storeUrl || !bridgeUrl) return;
  const baseUrl = storeUrl.replace(/\/$/, '');
  const headers = {};
  if (config.internal.storeAuth) {
    headers.Authorization = 'Bearer ' + config.internal.storeAuth;
  }
  const scopes = ['mesh'];
  if (config.outboundScope && config.outboundScope !== 'mesh') {
    scopes.push(config.outboundScope);
  }
  const memoryMessages = [];
  for (const scope of scopes) {
    try {
      const list = await getJson(baseUrl + '/mesh/memory?scope=' + encodeURIComponent(scope), { headers });
      for (const row of list) {
        memoryMessages.push(
          messages.createMemoryMessage({
            scope: row.scope,
            key: row.key,
            value: row.value,
            nodeId: row.node_id,
            ts: row.updated_at,
          })
        );
      }
    } catch (e) {
      log('warn', 'federation_store_to_bridge_store_failed', { scope, error: e.message });
    }
  }
  try {
    const skillsList = await getJson(baseUrl + '/mesh/skills', { headers });
    const skillMessages = skillsList.map((row) =>
      messages.createSkillMessage({
        name: row.name,
        sourceNode: row.source_node,
        content: row.content || '',
        ts: row.updated_at,
      })
    );
    const all = [...memoryMessages, ...skillMessages];
    if (all.length === 0) return;
    await postJson(bridgeUrl, all.length === 1 ? all[0] : all);
    log('info', 'federation_store_to_bridge_ok', { sent: all.length });
  } catch (e) {
    log('warn', 'federation_store_to_bridge_forward_failed', { error: e.message });
  }
}

/**
 * Immediate outbound: POST given messages to each external mesh with direction outbound/both. Filters by audience (value._meta.audience or both).
 */
async function runOutboundImmediate(config, outboundMessages) {
  if (outboundMessages.length === 0) return;
  const externalOutbound = (config.externalMeshes || []).filter((m) => m.direction === 'outbound' || m.direction === 'both');
  if (externalOutbound.length === 0) return;
  let payload = outboundMessages;
  const signOutbound = config.signOutbound && config.privateKey && signing;
  if (signOutbound) {
    payload = outboundMessages.map((msg) => signing.signMessage({ ...msg }, config.privateKey));
  }
  const headers = {};
  if (config.internal && config.internal.storeAuth) {
    headers.Authorization = 'Bearer ' + config.internal.storeAuth;
  }
  for (const ext of externalOutbound) {
    const endpoint = ext.endpoint;
    if (!endpoint) continue;
    const postHeaders = { ...headers };
    if (ext.outboundBearer) {
      postHeaders.Authorization = 'Bearer ' + ext.outboundBearer;
    }
    try {
      await postJson(endpoint, payload.length === 1 ? payload[0] : payload, { headers: postHeaders });
      metrics.outboundOk++;
      log('info', 'federation_share_immediate_outbound_ok', { meshId: ext.meshId, sent: payload.length });
    } catch (e) {
      metrics.outboundErrors++;
      log('error', 'federation_share_immediate_outbound_failed', { meshId: ext.meshId, error: e.message });
    }
  }
}

/**
 * Outbound: fetch memory/skills from store API, filter, convert to mesh messages, POST to each external mesh with direction outbound/both.
 */
async function runOutbound(config) {
  const storeUrl = config.internal && config.internal.storeApiUrl;
  if (!storeUrl) return;
  const externalOutbound = (config.externalMeshes || []).filter((m) => m.direction === 'outbound' || m.direction === 'both');
  if (externalOutbound.length === 0) return;

  const headers = {};
  if (config.internal.storeAuth) {
    headers.Authorization = 'Bearer ' + config.internal.storeAuth;
  }
  const baseUrl = storeUrl.replace(/\/$/, '');

  let memoryList = [];
  let skillsList = [];
  try {
    const scope = config.outboundScope || 'mesh';
    memoryList = await getJson(baseUrl + '/mesh/memory?scope=' + encodeURIComponent(scope), { headers });
    skillsList = await getJson(baseUrl + '/mesh/skills', { headers });
  } catch (e) {
    log('warn', 'federation_outbound_store_failed', { error: e.message });
    return;
  }

  const allowList = config.outboundKeysAllowList;
  const memoryMessages = [];
  for (const row of memoryList) {
    if (allowList && allowList.length && !allowList.includes(row.key)) continue;
    memoryMessages.push(
      messages.createMemoryMessage({
        scope: row.scope,
        key: row.key,
        value: row.value,
        nodeId: row.node_id,
        ts: row.updated_at,
      })
    );
  }
  const skillMessages = [];
  for (const row of skillsList) {
    const content = row.content || '';
    skillMessages.push(
      messages.createSkillMessage({
        name: row.name,
        sourceNode: row.source_node,
        content,
        ts: row.updated_at,
      })
    );
  }
  let outbound = [...memoryMessages, ...skillMessages];
  if (outbound.length === 0) return;

  const signOutbound = config.signOutbound && config.privateKey && signing;
  if (signOutbound) {
    outbound = outbound.map((msg) => signing.signMessage({ ...msg }, config.privateKey));
  }

  for (const ext of externalOutbound) {
    const endpoint = ext.endpoint;
    if (!endpoint) continue;
    const postHeaders = { ...headers };
    if (ext.outboundBearer) {
      postHeaders.Authorization = 'Bearer ' + ext.outboundBearer;
    }
    try {
      await postJson(endpoint, outbound.length === 1 ? outbound[0] : outbound, { headers: postHeaders });
      metrics.outboundOk++;
      log('info', 'federation_outbound_ok', { meshId: ext.meshId, sent: outbound.length });
    } catch (e) {
      metrics.outboundErrors++;
      log('error', 'federation_outbound_failed', { meshId: ext.meshId, error: e.message });
    }
  }
}

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error('Federation hub config error:', e.message);
  process.exit(1);
}

if (config.signOutbound) {
  if (config.privateKeyPath && fs.existsSync(config.privateKeyPath)) {
    config.privateKey = fs.readFileSync(config.privateKeyPath, 'utf8');
  } else if (config.privateKeyEnv && process.env[config.privateKeyEnv]) {
    config.privateKey = process.env[config.privateKeyEnv];
  } else {
    config.signOutbound = false;
    log('warn', 'federation_signing_disabled', { reason: 'no private key' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const reqId = 'fh-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  if ((req.method === 'GET' && pathname === '/health') || (req.method === 'GET' && pathname === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'openclaw-federation-hub' }));
    return;
  }

  if (req.method === 'GET' && pathname === '/metrics' && METRICS_ENABLED) {
    const out = [
      '# HELP federation_hub_inbound_total Total inbound requests',
      '# TYPE federation_hub_inbound_total counter',
      'federation_hub_inbound_total ' + metrics.inboundTotal,
      '# HELP federation_hub_inbound_errors Inbound auth/body errors',
      '# TYPE federation_hub_inbound_errors counter',
      'federation_hub_inbound_errors ' + metrics.inboundErrors,
      '# HELP federation_hub_forward_errors Forward to internal bridge errors',
      '# TYPE federation_hub_forward_errors counter',
      'federation_hub_forward_errors ' + metrics.forwardErrors,
      '# HELP federation_hub_outbound_ok Outbound POST success count',
      '# TYPE federation_hub_outbound_ok counter',
      'federation_hub_outbound_ok ' + metrics.outboundOk,
      '# HELP federation_hub_outbound_errors Outbound POST errors',
      '# TYPE federation_hub_outbound_errors counter',
      'federation_hub_outbound_errors ' + metrics.outboundErrors,
      '# HELP federation_hub_share_total Share endpoint requests',
      '# TYPE federation_hub_share_total counter',
      'federation_hub_share_total ' + metrics.shareTotal,
      '# HELP federation_hub_share_errors Share auth/body errors',
      '# TYPE federation_hub_share_errors counter',
      'federation_hub_share_errors ' + metrics.shareErrors,
    ].join('\n');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(out);
    return;
  }

  if (req.method === 'POST' && pathname === '/federation/share') {
    if (!checkShareAuth(config, req)) {
      metrics.shareErrors++;
      log('warn', 'federation_share_auth_failed', { reqId });
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: missing or invalid Authorization Bearer for share' }));
      return;
    }
    metrics.shareTotal++;

    let body;
    try {
      const raw = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
      });
      body = JSON.parse(raw);
    } catch (e) {
      metrics.shareErrors++;
      log('error', 'federation_share_body_failed', { reqId, error: e.message });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    const { messages: rawList, audience, targetUnit, targetTheater } = parseShareBody(body);
    const normalized = [];
    for (const msg of rawList) {
      if (!messages.isMemoryMessage(msg) && !messages.isSkillMessage(msg)) continue;
      normalized.push(applyShareEnvelope(msg, audience, targetUnit, targetTheater));
    }
    if (normalized.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ingested: 0, memory: 0, skill: 0 }));
      return;
    }

    const bridgeUrl = config.internal && config.internal.bridgeWebhookUrl;
    if (bridgeUrl) {
      try {
        await postJson(bridgeUrl, normalized.length === 1 ? normalized[0] : normalized);
        log('info', 'federation_share_bridge_ok', { reqId, ingested: normalized.length });
      } catch (e) {
        metrics.forwardErrors++;
        log('error', 'federation_share_bridge_failed', { reqId, error: e.message });
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to forward to internal bridge: ' + e.message }));
        return;
      }
    }

    const writeToStore = config.internal.shareWriteToStore !== false && config.internal.storeApiUrl;
    if (writeToStore) {
      for (const msg of normalized) {
        await writeMessageToStore(config, msg);
      }
    }

    let immediateOutbound = false;
    if (config.internal.shareImmediateOutbound && config.externalMeshes && config.externalMeshes.some((m) => m.direction === 'outbound' || m.direction === 'both')) {
      const forFederation = normalized.filter((msg) => {
        if (messages.isSkillMessage(msg)) return true;
        const meta = msg.value && msg.value._meta;
        const aud = meta && meta.audience ? meta.audience : 'both';
        return aud === 'federation' || aud === 'both';
      });
      if (forFederation.length > 0) {
        await runOutboundImmediate(config, forFederation);
        immediateOutbound = true;
      }
    }

    const memory = normalized.filter((m) => m.type === 'memory').length;
    const skill = normalized.filter((m) => m.type === 'skill').length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ingested: normalized.length, memory, skill, storeWritten: writeToStore, immediateOutbound }));
    return;
  }

  if (req.method === 'POST' && pathname === '/federation/in') {
    const ext = resolveExternalMesh(config, req);
    if (!ext) {
      metrics.inboundErrors++;
      log('warn', 'federation_in_auth_failed', { reqId, meshId: req.headers['x-mesh-id'] });
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: invalid or missing X-Mesh-Id / API key' }));
      return;
    }
    metrics.inboundTotal++;

    let body;
    try {
      const raw = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
      });
      body = JSON.parse(raw);
    } catch (e) {
      metrics.inboundErrors++;
      log('error', 'federation_in_body_failed', { reqId, error: e.message });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    const list = Array.isArray(body) ? body : [body];
    const allowed = [];
    const verifyInbound = config.verifyInbound && ext.publicKey && signing;
    for (const msg of list) {
      if (!messages.isMemoryMessage(msg) && !messages.isSkillMessage(msg)) continue;
      if (verifyInbound && !signing.verifyMessage(msg, ext.publicKey)) continue;
      if (!allowInbound(msg, ext.allowedInboundScopesKeys)) continue;
      allowed.push(applyProvenance(msg, ext.meshId));
    }

    if (allowed.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ingested: 0, memory: 0, skill: 0 }));
      return;
    }

    const bridgeUrl = config.internal && config.internal.bridgeWebhookUrl;
    if (!bridgeUrl) {
      log('error', 'federation_in_no_bridge_url', { reqId });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Hub not configured with internal.bridgeWebhookUrl' }));
      return;
    }

    try {
      const result = await postJson(bridgeUrl, allowed.length === 1 ? allowed[0] : allowed);
      const memory = allowed.filter((m) => m.type === 'memory').length;
      const skill = allowed.filter((m) => m.type === 'skill').length;
      log('info', 'federation_in_ok', { reqId, meshId: ext.meshId, ingested: allowed.length, memory, skill });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ingested: allowed.length, memory, skill }));
    } catch (e) {
      metrics.forwardErrors++;
      log('error', 'federation_in_forward_failed', { reqId, meshId: ext.meshId, error: e.message });
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to forward to internal bridge: ' + e.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Use POST /federation/in, POST /federation/share, or GET /health' }));
});

const OUTBOUND_POLL_MS = 60 * 1000; // 1 min default

server.listen(PORT, () => {
  log('info', 'federation_hub_listening', { port: PORT, configPath });
  console.error('OpenClaw Federation Hub listening on http://localhost:' + PORT);
  console.error('  POST /federation/in  — from external meshes (X-Mesh-Id + Bearer token or X-API-Key)');
  if (config.internal && (config.internal.shareSecret || config.internal.shareBearer)) {
    console.error('  POST /federation/share — internal intel share (Authorization: Bearer <shareSecret/shareBearer>)');
  }
  console.error('  GET  /health');
  if (METRICS_ENABLED) console.error('  GET  /metrics');
  if (config.internal && config.internal.storeApiUrl) {
    const intervalMs = config.outboundPollIntervalMs || OUTBOUND_POLL_MS;
    setInterval(() => runOutbound(config), intervalMs);
    log('info', 'federation_outbound_poll_started', { intervalMs });
  }
  const storeToBridgeMs = config.internal && config.internal.storeToBridgeIntervalMs;
  if (storeToBridgeMs && config.internal.bridgeWebhookUrl && config.internal.storeApiUrl) {
    setInterval(() => runStoreToBridge(config), storeToBridgeMs);
    log('info', 'federation_store_to_bridge_started', { intervalMs: storeToBridgeMs });
  }
});
