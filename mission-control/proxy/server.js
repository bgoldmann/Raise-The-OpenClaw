#!/usr/bin/env node
/**
 * Mission Control backend proxy — holds gateway config and tokens, opens WebSockets to
 * OpenClaw gateways, and exposes one WebSocket to the frontend so tokens never leave the server.
 *
 * Config: set OPENCLAW_MC_GATEWAYS to a JSON array of { id, name, wsUrl, token }.
 * Or set OPENCLAW_MC_CONFIG to path to a JSON file with { gateways: [...] }.
 *
 * Usage:
 *   node server.js [port]
 *   PORT=3080 OPENCLAW_MC_GATEWAYS='[{"id":"ceo","name":"CEO","wsUrl":"ws://localhost:18789","token":"..."}]' node server.js
 *
 * Endpoints:
 *   GET  /           — serve Mission Control static (parent dir)
 *   GET  /ws         — WebSocket: proxy to gateways; client sends { gatewayId, ...frame }, receives { gatewayId, ...frame }
 *   GET  /api/gateways — list gateways (no tokens)
 *   GET  /health     — health check
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = parseInt(process.env.PORT || process.argv[2] || '3080', 10);
const MISSION_CONTROL_DIR = process.env.MISSION_CONTROL_DIR || path.join(__dirname, '..');
const FEDERATION_HUB_URL = process.env.OPENCLAW_MC_FEDERATION_HUB_URL || null;
const TENANT_HEADER = process.env.OPENCLAW_MC_TENANT_HEADER || null;

function loadGateways() {
  const raw = process.env.OPENCLAW_MC_GATEWAYS;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Invalid OPENCLAW_MC_GATEWAYS JSON:', e.message);
      return [];
    }
  }
  const configPath = process.env.OPENCLAW_MC_CONFIG || path.join(__dirname, 'gateways.json');
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return data.gateways || data || [];
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Config load error:', e.message);
    return [];
  }
}

const gateways = loadGateways();

function serveStatic(req, res) {
  const p = path.join(MISSION_CONTROL_DIR, req.url === '/' ? 'index.html' : req.url.replace(/^\//, ''));
  const safe = path.relative(MISSION_CONTROL_DIR, path.resolve(p));
  if (safe.startsWith('..')) {
    res.writeHead(404);
    res.end();
    return;
  }
  fs.readFile(p, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = path.extname(p);
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.json': 'application/json' };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (url.pathname === '/health' || url.pathname === '/') {
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'mission-control-proxy', gateways: gateways.length }));
      return;
    }
  }
  if (url.pathname === '/api/gateways') {
    let list = gateways.map(g => ({ id: g.id, name: g.name, wsUrl: g.wsUrl, controlUiUrl: g.controlUiUrl || null, _tenantId: g.tenantId || null }));
    if (TENANT_HEADER) {
      const tenant = req.headers[TENANT_HEADER.toLowerCase()];
      if (tenant) list = list.filter(g => (g._tenantId || '') === tenant);
      else list = list.filter(g => !g._tenantId);
    }
    list = list.map(g => ({ id: g.id, name: g.name, wsUrl: g.wsUrl, controlUiUrl: g.controlUiUrl || null }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ gateways: list }));
    return;
  }
  if (url.pathname === '/api/federation/health') {
    if (!FEDERATION_HUB_URL) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not configured', ok: false }));
      return;
    }
    const hubUrl = FEDERATION_HUB_URL.replace(/\/$/, '') + '/health';
    const lib = hubUrl.startsWith('https') ? require('https') : require('http');
    lib.get(hubUrl, (upstream) => {
      const chunks = [];
      upstream.on('data', c => chunks.push(c));
      upstream.on('end', () => {
        res.writeHead(upstream.statusCode || 200, { 'Content-Type': 'application/json' });
        res.end(Buffer.concat(chunks));
      });
    }).on('error', () => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Federation hub unreachable' }));
    });
    return;
  }
  if (url.pathname === '/ws') {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Use WebSocket to connect to this endpoint.');
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://localhost:${PORT}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

const gatewaySockets = {};
const pendingByGateway = {};

function connectProxyToGateway(gatewayId, gw, clientWs) {
  if (!gw.wsUrl) return;
  try {
    const gws = new WebSocket(gw.wsUrl);
    gatewaySockets[gatewayId] = gws;
    pendingByGateway[gatewayId] = {};
    let challengeNonce = null;
    let connected = false;

    gws.on('message', (data) => {
      if (!clientWs || clientWs.readyState !== WebSocket.OPEN) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          challengeNonce = msg.payload?.nonce || '';
          const req = {
            type: 'req',
            id: 'mc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: { id: 'mission-control-proxy', version: '1.0', platform: 'node', mode: 'operator' },
              role: 'operator',
              scopes: ['operator.read', 'operator.write', 'operator.approvals'],
              auth: { token: gw.token || '' },
              device: { id: 'mc-proxy-' + gatewayId, nonce: challengeNonce, publicKey: '', signature: '' }
            }
          };
          gws.send(JSON.stringify(req));
          return;
        }
        if (msg.type === 'res' && msg.id && pendingByGateway[gatewayId][msg.id]) {
          const cb = pendingByGateway[gatewayId][msg.id];
          delete pendingByGateway[gatewayId][msg.id];
          cb(msg);
          return;
        }
        clientWs.send(JSON.stringify({ gatewayId, ...msg }));
      } catch (e) {
        clientWs.send(JSON.stringify({ gatewayId, type: 'event', event: 'proxy.error', payload: { message: e.message } }));
      }
    });

    gws.on('close', () => {
      delete gatewaySockets[gatewayId];
      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ gatewayId, type: 'event', event: 'proxy.disconnected', payload: {} }));
      }
    });
    gws.on('error', (err) => {
      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ gatewayId, type: 'event', event: 'proxy.error', payload: { message: err.message } }));
      }
    });
  } catch (e) {
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ gatewayId, type: 'event', event: 'proxy.error', payload: { message: e.message } }));
    }
  }
}

wss.on('connection', (clientWs) => {
  gateways.forEach((gw) => connectProxyToGateway(gw.id, gw, clientWs));
  clientWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const gatewayId = msg.gatewayId;
      const gws = gatewaySockets[gatewayId];
      if (!gws || gws.readyState !== WebSocket.OPEN) return;
      const { gatewayId: _, ...frame } = msg;
      if (frame.type === 'req' && frame.id) {
        pendingByGateway[gatewayId] = pendingByGateway[gatewayId] || {};
        pendingByGateway[gatewayId][frame.id] = (res) => {
          if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify({ gatewayId, ...res }));
        };
      }
      gws.send(JSON.stringify(frame));
    } catch (e) {
      console.error('Proxy client message error:', e);
    }
  });
  clientWs.on('close', () => {
    Object.keys(gatewaySockets).forEach((id) => {
      gatewaySockets[id].close();
    });
    Object.keys(gatewaySockets).forEach((id) => delete gatewaySockets[id]);
  });
});

server.listen(PORT, () => {
  console.error(`Mission Control proxy listening on http://localhost:${PORT}`);
  console.error('  GET  /       — Mission Control dashboard');
  console.error('  GET  /ws     — WebSocket (connect from dashboard with proxy URL)');
  console.error('  GET  /api/gateways — list gateways (no tokens)');
  console.error('  GET  /health — health check');
  console.error(`  Gateways loaded: ${gateways.length}`);
});
