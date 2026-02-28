#!/usr/bin/env node
/**
 * OpenClaw Bridge — Minimal webhook server to receive bridge traffic and run mesh ingest.
 * Run on one or both mesh nodes; point your channel outbound webhook or a forwarder script at it.
 *
 * Usage:
 *   node webhook-server.js [port]
 *   PORT=4077 node webhook-server.js
 *
 * Optional auth (enterprise): set BRIDGE_AUTH_HEADER=X-API-Key and BRIDGE_AUTH_SECRET=your-secret
 *   or BRIDGE_AUTH_BEARER=your-bearer-token (expects Authorization: Bearer <token>).
 *   If set, POST /ingest and POST /bridge require the header; otherwise no auth.
 *
 * Endpoints:
 *   POST /ingest  — Body: JSON (single mesh message or array). Ingests into local cache. Returns { ingested, memory, skill }.
 *   POST /bridge  — Body: bridge envelope (e.g. Telegram update). Use ?unwrap=telegram|discord|generic to unwrap. Returns same + optional response if mesh_request and handleRequest.
 *   GET  /health  — 200 OK
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleBridgeMessage } = require(path.join(__dirname, 'adapter.js'));

const PORT = parseInt(process.env.PORT || process.argv[2] || '4077', 10);
const AUTH_HEADER = process.env.BRIDGE_AUTH_HEADER || null;
const AUTH_SECRET = process.env.BRIDGE_AUTH_SECRET || null;
const AUTH_BEARER = process.env.BRIDGE_AUTH_BEARER || null;
const METRICS_ENABLED = process.env.BRIDGE_METRICS !== '0';
const RATE_LIMIT_PER_MIN = parseInt(process.env.BRIDGE_RATE_LIMIT_PER_MIN || '0', 10);
const rateLimitWindowMs = 60 * 1000;
const rateLimitByKey = new Map();
function checkRateLimit(req) {
  if (RATE_LIMIT_PER_MIN <= 0) return true;
  const key = req.headers.authorization || req.headers[AUTH_HEADER?.toLowerCase()] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = rateLimitByKey.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + rateLimitWindowMs };
    rateLimitByKey.set(key, entry);
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_PER_MIN) return false;
  return true;
}

const metrics = { ingestTotal: 0, ingestErrors: 0, bridgeTotal: 0, bridgeErrors: 0, requestDurationMs: [] };
function logStructured(level, msg, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  console.error(line);
}
function checkAuth(req) {
  if (!AUTH_HEADER && !AUTH_BEARER) return true;
  if (AUTH_BEARER) {
    const auth = req.headers.authorization;
    if (!auth || auth !== 'Bearer ' + AUTH_BEARER) return false;
    return true;
  }
  const val = req.headers[AUTH_HEADER.toLowerCase()];
  return val === AUTH_SECRET;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    const os = require('os');
    const cacheDir = process.env.OPENCLAW_HOME ? path.join(process.env.OPENCLAW_HOME, 'mesh-memory.json') : path.join(os.homedir(), '.openclaw', 'mesh-memory.json');
    let cacheWritable = true;
    try {
      const dir = path.dirname(cacheDir);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
    } catch (e) { cacheWritable = false; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'openclaw-bridge-ingest', cacheWritable }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;
  if ((pathname === '/ingest' || pathname === '/bridge') && !checkAuth(req)) {
    logStructured('warn', 'auth_failed', { path: pathname });
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  if ((pathname === '/ingest' || pathname === '/bridge') && !checkRateLimit(req)) {
    logStructured('warn', 'rate_limit_exceeded', { path: pathname });
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too many requests' }));
    return;
  }
  const unwrap = url.searchParams.get('unwrap') || null;
  const handleRequest = url.searchParams.get('handleRequest') === 'true' || url.searchParams.get('handleRequest') === '1';
  const reqId = 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const start = Date.now();

  let body;
  try {
    const raw = await parseBody(req);
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  } catch (e) {
    logStructured('error', 'body_read_failed', { reqId, path: pathname, error: e.message });
    send(res, 400, { error: 'Failed to read body' });
    return;
  }

  if (pathname === '/ingest') {
    try {
      const result = handleBridgeMessage(body, { openclawDir: process.env.OPENCLAW_HOME });
      metrics.ingestTotal++;
      if (METRICS_ENABLED) metrics.requestDurationMs.push(Date.now() - start);
      logStructured('info', 'ingest_ok', { reqId, ingested: result.ingested });
      send(res, 200, { ingested: result.ingested, memory: result.memory, skill: result.skill });
    } catch (e) {
      metrics.ingestErrors++;
      logStructured('error', 'ingest_error', { reqId, error: e.message });
      send(res, 500, { error: e.message });
    }
    return;
  }

  if (pathname === '/bridge') {
    try {
      const result = handleBridgeMessage(body, {
        unwrap: unwrap || 'generic',
        handleRequest,
        nodeId: process.env.MESH_NODE_ID || 'local',
        openclawDir: process.env.OPENCLAW_HOME,
      });
      metrics.bridgeTotal++;
      if (METRICS_ENABLED) metrics.requestDurationMs.push(Date.now() - start);
      logStructured('info', 'bridge_ok', { reqId, ingested: result.ingested });
      const out = { ingested: result.ingested, memory: result.memory, skill: result.skill };
      if (result.response) out.response = result.response;
      send(res, 200, out);
    } catch (e) {
      metrics.bridgeErrors++;
      logStructured('error', 'bridge_error', { reqId, error: e.message });
      send(res, 500, { error: e.message });
    }
    return;
  }

  if (pathname === '/metrics' && METRICS_ENABLED && req.method === 'GET') {
    const last = metrics.requestDurationMs.slice(-100);
    const out = [
      '# HELP bridge_ingest_total Total ingest requests',
      '# TYPE bridge_ingest_total counter',
      'bridge_ingest_total ' + metrics.ingestTotal,
      '# HELP bridge_ingest_errors Total ingest errors',
      'bridge_ingest_errors ' + metrics.ingestErrors,
      '# HELP bridge_bridge_total Total bridge requests',
      'bridge_bridge_total ' + metrics.bridgeTotal,
      '# HELP bridge_bridge_errors Total bridge errors',
      'bridge_bridge_errors ' + metrics.bridgeErrors,
    ].join('\n');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(out);
    return;
  }

  send(res, 404, { error: 'Not found. Use POST /ingest or POST /bridge' });
});

server.listen(PORT, () => {
  console.error(`OpenClaw bridge ingest listening on http://localhost:${PORT}`);
  console.error('  POST /ingest  — JSON body (mesh message or array)');
  console.error('  POST /bridge  — envelope (optional ?unwrap=telegram|discord&handleRequest=true)');
  console.error('  GET  /health  — health check');
});
