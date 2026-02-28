#!/usr/bin/env node
/**
 * OpenClaw Mesh Store — HTTP API server (access-model Option A)
 * Exposes GET/PUT/list for mesh memory and skills. Backend: SQLite via client.js.
 *
 * Usage:
 *   node api-server.js [port]
 *   MESH_STORE_DB_PATH=/path/to/mesh-store.sqlite node api-server.js
 *
 * Optional auth: MESH_STORE_AUTH_HEADER=X-API-Key + MESH_STORE_AUTH_SECRET=secret
 *   or MESH_STORE_AUTH_BEARER=token (expects Authorization: Bearer <token>).
 *
 * Endpoints:
 *   GET  /health              — 200 + { ok, service, storeAvailable }
 *   GET  /mesh/memory?scope=  — list memory (optional scope)
 *   GET  /mesh/memory/:scope/:key — get one
 *   PUT  /mesh/memory         — body: { scope, key, value, node_id }
 *   GET  /mesh/skills         — list skills
 *   GET  /mesh/skills/:name   — get one
 *   PUT  /mesh/skills        — body: { name, source_node, content } or { ..., path }
 */

const http = require('http');
const path = require('path');
const { openStore } = require(path.join(__dirname, 'client.js'));

const PORT = parseInt(process.env.PORT || process.env.MESH_STORE_PORT || process.argv[2] || '4078', 10);
const DB_PATH = process.env.MESH_STORE_DB_PATH || null;
const AUTH_HEADER = process.env.MESH_STORE_AUTH_HEADER || null;
const AUTH_SECRET = process.env.MESH_STORE_AUTH_SECRET || null;
const AUTH_BEARER = process.env.MESH_STORE_AUTH_BEARER || null;
const RATE_LIMIT_PER_MIN = parseInt(process.env.MESH_STORE_RATE_LIMIT_PER_MIN || '0', 10);
const rateLimitWindowMs = 60 * 1000;
const rateLimitByKey = new Map();
function checkRateLimit(req) {
  if (RATE_LIMIT_PER_MIN <= 0) return true;
  const key = req.headers.authorization || (AUTH_HEADER && req.headers[AUTH_HEADER.toLowerCase()]) || req.socket.remoteAddress || 'unknown';
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

const store = DB_PATH ? openStore(DB_PATH) : null;

function checkAuth(req) {
  if (!AUTH_HEADER && !AUTH_BEARER) return true;
  if (AUTH_BEARER) {
    const auth = req.headers.authorization;
    if (!auth || auth !== 'Bearer ' + AUTH_BEARER) return false;
    return true;
  }
  const key = AUTH_HEADER.toLowerCase();
  const val = req.headers[key];
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

function sendError(res, statusCode, message) {
  send(res, statusCode, { error: message });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && (pathname === '/health' || pathname === '/')) {
    send(res, 200, { ok: true, service: 'openclaw-mesh-store-api', storeAvailable: !!store });
    return;
  }

  if ((pathname.startsWith('/mesh/') || pathname === '/mesh') && !checkAuth(req)) {
    send(res, 401, { error: 'Unauthorized' });
    return;
  }
  if ((pathname.startsWith('/mesh/') || pathname === '/mesh') && !checkRateLimit(req)) {
    send(res, 429, { error: 'Too many requests' });
    return;
  }

  if (!store) {
    if (pathname.startsWith('/mesh/')) {
      send(res, 503, { error: 'Store not available (no DB or better-sqlite3)' });
      return;
    }
    send(res, 404, { error: 'Not found' });
    return;
  }

  // GET /mesh/memory?scope=mesh
  if (req.method === 'GET' && pathname === '/mesh/memory') {
    const scope = url.searchParams.get('scope') || null;
    const list = store.listMemory(scope);
    send(res, 200, list);
    return;
  }

  // GET /mesh/memory/:scope/:key
  const memoryMatch = pathname.match(/^\/mesh\/memory\/([^/]+)\/(.+)$/);
  if (req.method === 'GET' && memoryMatch) {
    const [, scope, key] = memoryMatch;
    const row = store.getMemory(decodeURIComponent(scope), decodeURIComponent(key));
    if (!row) {
      send(res, 404, { error: 'Not found' });
      return;
    }
    send(res, 200, row);
    return;
  }

  // PUT /mesh/memory
  if (req.method === 'PUT' && pathname === '/mesh/memory') {
    let body;
    try {
      const raw = await parseBody(req);
      body = JSON.parse(raw);
    } catch {
      sendError(res, 400, 'Invalid JSON body');
      return;
    }
    const { scope, key, value, node_id } = body;
    if (!scope || !key || value === undefined) {
      sendError(res, 400, 'Missing scope, key, or value');
      return;
    }
    const row = store.putMemory(scope, key, value, node_id || 'unknown');
    send(res, 200, row);
    return;
  }

  // GET /mesh/skills
  if (req.method === 'GET' && pathname === '/mesh/skills') {
    const list = store.listSkills();
    send(res, 200, list);
    return;
  }

  // GET /mesh/skills/:name
  const skillMatch = pathname.match(/^\/mesh\/skills\/([^/]+)$/);
  if (req.method === 'GET' && skillMatch) {
    const name = decodeURIComponent(skillMatch[1]);
    const row = store.getSkill(name);
    if (!row) {
      send(res, 404, { error: 'Not found' });
      return;
    }
    send(res, 200, row);
    return;
  }

  // PUT /mesh/skills
  if (req.method === 'PUT' && pathname === '/mesh/skills') {
    let body;
    try {
      const raw = await parseBody(req);
      body = JSON.parse(raw);
    } catch {
      sendError(res, 400, 'Invalid JSON body');
      return;
    }
    const { name, source_node, content, path: pathVal } = body;
    if (!name || !source_node) {
      sendError(res, 400, 'Missing name or source_node');
      return;
    }
    if (content === undefined && pathVal === undefined) {
      sendError(res, 400, 'Missing content or path');
      return;
    }
    const row = store.putSkill(name, source_node, content ?? null, pathVal ?? null);
    send(res, 200, row);
    return;
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.error('OpenClaw mesh store API listening on http://localhost:' + PORT);
  console.error('  GET  /health');
  console.error('  GET  /mesh/memory?scope=mesh   PUT /mesh/memory');
  console.error('  GET  /mesh/memory/:scope/:key');
  console.error('  GET  /mesh/skills   GET /mesh/skills/:name   PUT /mesh/skills');
  if (!store) console.error('  WARN: Store not available (set MESH_STORE_DB_PATH and install better-sqlite3)');
});
