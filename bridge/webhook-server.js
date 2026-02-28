#!/usr/bin/env node
/**
 * OpenClaw Bridge — Minimal webhook server to receive bridge traffic and run mesh ingest.
 * Run on one or both mesh nodes; point your channel outbound webhook or a forwarder script at it.
 *
 * Usage:
 *   node webhook-server.js [port]
 *   PORT=4077 node webhook-server.js
 *
 * Endpoints:
 *   POST /ingest  — Body: JSON (single mesh message or array). Ingests into local cache. Returns { ingested, memory, skill }.
 *   POST /bridge  — Body: bridge envelope (e.g. Telegram update). Use ?unwrap=telegram|discord|generic to unwrap. Returns same + optional response if mesh_request and handleRequest.
 *   GET  /health  — 200 OK
 */

const http = require('http');
const path = require('path');
const { handleBridgeMessage } = require(path.join(__dirname, 'adapter.js'));

const PORT = parseInt(process.env.PORT || process.argv[2] || '4077', 10);

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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'openclaw-bridge-ingest' }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const unwrap = url.searchParams.get('unwrap') || null;
  const handleRequest = url.searchParams.get('handleRequest') === 'true' || url.searchParams.get('handleRequest') === '1';

  let body;
  try {
    const raw = await parseBody(req);
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  } catch (e) {
    send(res, 400, { error: 'Failed to read body' });
    return;
  }

  if (pathname === '/ingest') {
    const result = handleBridgeMessage(body, { openclawDir: process.env.OPENCLAW_HOME });
    send(res, 200, { ingested: result.ingested, memory: result.memory, skill: result.skill });
    return;
  }

  if (pathname === '/bridge') {
    const result = handleBridgeMessage(body, {
      unwrap: unwrap || 'generic',
      handleRequest,
      nodeId: process.env.MESH_NODE_ID || 'local',
      openclawDir: process.env.OPENCLAW_HOME,
    });
    const out = { ingested: result.ingested, memory: result.memory, skill: result.skill };
    if (result.response) out.response = result.response;
    send(res, 200, out);
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
