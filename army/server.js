#!/usr/bin/env node
/**
 * Army of OpenClaw — Registry API + Dispatcher
 * Exposes registry (nodes, units) and orders (POST order → resolve addressee → send to bridge).
 * Uses mesh store (SQLite) for army_registry and army_orders. Requires MESH_STORE_DB_PATH.
 *
 * Usage:
 *   MESH_STORE_DB_PATH=/path/to/mesh-store.sqlite node army/server.js [port]
 *   PORT=4080 node army/server.js
 *
 * Endpoints:
 *   GET  /health
 *   POST /army/register     — body: { id?, gateway_id, agent_id?, rank, unit, platoon?, theater?, skills, status?, capacity?, ingest_url?, model_ranking? }
 *   GET  /army/nodes       — ?skill= & ?unit= & ?status=
 *   GET  /army/nodes/:id
 *   PATCH /army/nodes/:id  — body: { status?, capacity?, skills?, ... }
 *   GET  /army/units
 *   POST /army/orders      — body: { orderId, type?, addressee, payload, priority?, deadline?, from }
 *   GET  /army/orders      — ?status=pending|in_progress|completed|failed
 *   GET  /metrics         — Prometheus-style (army_orders_total, army_registry_nodes, etc.)
 */

const http = require('http');
const https = require('https');
const path = require('path');
const { openStore } = require(path.join(__dirname, '..', 'mesh', 'store', 'client.js'));

const PORT = parseInt(process.env.PORT || process.env.ARMY_PORT || process.argv[2] || '4080', 10);
const DB_PATH = process.env.MESH_STORE_DB_PATH || null;
const AUTH_BEARER = process.env.ARMY_AUTH_BEARER || null;
const RANKS_ALLOWED_ISSUE = ['general', 'colonel', 'captain'];
const REGISTRY_TTL_SEC = parseInt(process.env.ARMY_REGISTRY_TTL_SEC || '600', 10); // 10 min → mark stale
const METRICS_ENABLED = process.env.ARMY_METRICS !== '0';

const store = DB_PATH ? openStore(DB_PATH) : null;

const metrics = {
  ordersTotal: 0,
  ordersFailed: 0,
  ordersCompleted: 0,
  dispatchErrors: 0,
};

function checkAuth(req) {
  if (!AUTH_BEARER) return true;
  const auth = req.headers.authorization;
  return auth && auth === 'Bearer ' + AUTH_BEARER;
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

/** POST to ingest_url with order as mesh memory message (key army.order.<orderId>) */
function sendOrderToNode(store, order, targetNode, cb) {
  const ingestUrl = targetNode.ingest_url;
  if (!ingestUrl) {
    return cb(new Error('Target node has no ingest_url'));
  }
  const memoryMessage = {
    type: 'memory',
    scope: 'mesh',
    key: 'army.order.' + order.order_id,
    value: {
      orderId: order.order_id,
      type: order.type,
      payload: order.payload,
      priority: order.priority,
      from: order.from_node,
      ts: order.ts,
      ...(order.strategy != null && order.strategy !== '' && { strategy: order.strategy }),
    },
    nodeId: order.from_node,
    ts: order.ts,
  };
  const body = JSON.stringify(memoryMessage);
  const url = new URL(ingestUrl);
  const opts = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname || '/ingest',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body, 'utf8') },
  };
  const lib = url.protocol === 'https:' ? https : http;
  const req = lib.request(opts, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        store.updateOrder(order.order_id, { status: 'in_progress', target_node_id: targetNode.id });
        cb(null);
      } else {
        cb(new Error('Ingest returned ' + res.statusCode));
      }
    });
  });
  req.on('error', (err) => cb(err));
  req.setTimeout(15000, () => {
    req.destroy();
    cb(new Error('Ingest timeout'));
  });
  req.write(body);
  req.end();
}

/** Resolve addressee to a list of candidate nodes (best first). Used for failover. */
function resolveCandidates(store, addressee) {
  const nodes = store.listNodes({ status: 'available' });
  if (nodes.length === 0) return [];
  const a = typeof addressee === 'string' ? { gatewayId: addressee } : addressee || {};
  let list = [];
  if (a.gatewayId) {
    list = nodes.filter((n) => n.gateway_id === a.gatewayId);
  } else if (a.unit) {
    list = nodes.filter((n) => n.unit === a.unit);
  } else if (a.role || a.skill) {
    const skill = a.role || a.skill;
    list = nodes.filter((n) => n.skills && n.skills.includes(skill));
  } else {
    return [];
  }
  list.sort((x, y) => (store.countInProgressByNode(x.id) || 0) - (store.countInProgressByNode(y.id) || 0));
  return list;
}

function resolveTarget(store, addressee) {
  const list = resolveCandidates(store, addressee);
  return list[0] || null;
}

/** Check issuer rank (optional: require X-Node-Id and lookup in registry). */
function mayIssueOrder(req, store) {
  if (!AUTH_BEARER) return true;
  const nodeId = req.headers['x-node-id'];
  if (!nodeId || !store) return true;
  const node = store.getNode(nodeId);
  if (!node) return true;
  return RANKS_ALLOWED_ISSUE.includes((node.rank || '').toLowerCase());
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && (pathname === '/health' || pathname === '/')) {
    send(res, 200, { ok: true, service: 'openclaw-army', storeAvailable: !!store });
    return;
  }

  if (pathname.startsWith('/army/') && !checkAuth(req)) {
    send(res, 401, { error: 'Unauthorized' });
    return;
  }

  if (!store) {
    if (pathname.startsWith('/army/') || pathname === '/metrics') {
      send(res, 503, { error: 'Army store not available (set MESH_STORE_DB_PATH and install better-sqlite3)' });
      return;
    }
    send(res, 404, { error: 'Not found' });
    return;
  }

  // POST /army/register
  if (req.method === 'POST' && pathname === '/army/register') {
    let body;
    try {
      body = JSON.parse(await parseBody(req));
    } catch {
      sendError(res, 400, 'Invalid JSON');
      return;
    }
    const id = body.id || body.gateway_id + (body.agent_id ? '-' + body.agent_id : '');
    const row = store.registerNode({
      id,
      gateway_id: body.gateway_id,
      agent_id: body.agent_id,
      rank: body.rank || 'specialist',
      unit: body.unit || 'squad-1',
      platoon: body.platoon,
      theater: body.theater,
      skills: body.skills || [],
      status: body.status || 'available',
      capacity: body.capacity,
      ingest_url: body.ingest_url,
      model_ranking: body.model_ranking,
    });
    send(res, 200, row);
    return;
  }

  // GET /army/nodes
  if (req.method === 'GET' && pathname === '/army/nodes') {
    const skill = url.searchParams.get('skill') || null;
    const unit = url.searchParams.get('unit') || null;
    const status = url.searchParams.get('status') || null;
    const filters = {};
    if (skill) filters.skill = skill;
    if (unit) filters.unit = unit;
    if (status) filters.status = status;
    const list = store.listNodes(filters);
    send(res, 200, list);
    return;
  }

  // GET /army/nodes/:id and PATCH /army/nodes/:id
  const nodesIdMatch = pathname.match(/^\/army\/nodes\/([^/]+)$/);
  if (nodesIdMatch) {
    const id = decodeURIComponent(nodesIdMatch[1]);
    if (req.method === 'GET') {
      const node = store.getNode(id);
      if (!node) {
        send(res, 404, { error: 'Not found' });
        return;
      }
      send(res, 200, node);
      return;
    }
    if (req.method === 'PATCH') {
      let body;
      try {
        body = JSON.parse(await parseBody(req));
      } catch {
        sendError(res, 400, 'Invalid JSON');
        return;
      }
      const updated = store.updateNode(id, body);
      if (!updated) {
        send(res, 404, { error: 'Not found' });
        return;
      }
      send(res, 200, updated);
      return;
    }
  }

  // GET /army/units
  if (req.method === 'GET' && pathname === '/army/units') {
    const list = store.listUnits();
    send(res, 200, list);
    return;
  }

  // POST /army/orders — enqueue and dispatch immediately
  if (req.method === 'POST' && pathname === '/army/orders') {
    if (!mayIssueOrder(req, store)) {
      send(res, 403, { error: 'Issuer not allowed to issue orders (rank)' });
      return;
    }
    let body;
    try {
      body = JSON.parse(await parseBody(req));
    } catch {
      sendError(res, 400, 'Invalid JSON');
      return;
    }
    const orderId = body.orderId || 'ord-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    const order = store.putOrder({
      orderId,
      type: body.type || 'task',
      addressee: body.addressee,
      payload: body.payload,
      priority: body.priority || 'normal',
      deadline: body.deadline,
      from: body.from || req.headers['x-node-id'] || 'unknown',
      strategy: body.strategy,
      status: 'pending',
      max_retries: body.max_retries ?? 3,
    });
    if (METRICS_ENABLED) metrics.ordersTotal++;
    const candidates = resolveCandidates(store, body.addressee);
    if (candidates.length === 0) {
      store.updateOrder(orderId, { status: 'failed', error: 'No target node found for addressee' });
      if (METRICS_ENABLED) metrics.ordersFailed++;
      send(res, 202, { orderId, status: 'failed', error: 'No target node found for addressee', order });
      return;
    }
    let tried = 0;
    const maxTries = Math.min(candidates.length, order.max_retries || 3);
    function tryDispatch(idx) {
      if (idx >= maxTries) {
        store.updateOrder(orderId, { status: 'failed', error: 'All candidates failed', retry_count: tried });
        if (METRICS_ENABLED) { metrics.ordersFailed++; metrics.dispatchErrors++; }
        return;
      }
      const target = candidates[idx];
      tried++;
      sendOrderToNode(store, order, target, (err) => {
        if (err) {
          tryDispatch(idx + 1);
        } else {
          store.updateOrder(orderId, { status: 'in_progress', target_node_id: target.id });
        }
      });
    }
    tryDispatch(0);
    const firstTarget = candidates[0];
    send(res, 202, { orderId, status: 'pending', target_node_id: firstTarget.id, order });
    return;
  }

  // GET /army/orders
  if (req.method === 'GET' && pathname === '/army/orders') {
    const status = url.searchParams.get('status') || null;
    const list = store.listOrders(status ? { status } : {});
    send(res, 200, list);
    return;
  }

  // PATCH /army/orders/:orderId — update status/result (e.g. report_up)
  const orderIdMatch = pathname.match(/^\/army\/orders\/([^/]+)$/);
  if (req.method === 'PATCH' && orderIdMatch) {
    const orderId = decodeURIComponent(orderIdMatch[1]);
    let body;
    try {
      body = JSON.parse(await parseBody(req));
    } catch {
      sendError(res, 400, 'Invalid JSON');
      return;
    }
    const updated = store.updateOrder(orderId, {
      status: body.status,
      result: body.result,
      error: body.error,
    });
    if (!updated) {
      send(res, 404, { error: 'Not found' });
      return;
    }
    if (body.status === 'completed' && METRICS_ENABLED) metrics.ordersCompleted++;
    if (body.status === 'failed' && METRICS_ENABLED) metrics.ordersFailed++;
    send(res, 200, updated);
    return;
  }

  // GET /metrics
  if (req.method === 'GET' && pathname === '/metrics' && METRICS_ENABLED) {
    const nodes = store.listNodes({});
    const registryNodes = nodes.length;
    const pendingOrders = store.countOrdersByStatus('pending');
    const inProgressOrders = store.countOrdersByStatus('in_progress');
    const lines = [
      '# HELP army_orders_total Total orders submitted',
      '# TYPE army_orders_total counter',
      'army_orders_total ' + metrics.ordersTotal,
      '# HELP army_orders_failed Total orders failed',
      '# TYPE army_orders_failed counter',
      'army_orders_failed ' + metrics.ordersFailed,
      '# HELP army_orders_completed Total orders completed',
      '# TYPE army_orders_completed counter',
      'army_orders_completed ' + metrics.ordersCompleted,
      '# HELP army_registry_nodes Current registry node count',
      '# TYPE army_registry_nodes gauge',
      'army_registry_nodes ' + registryNodes,
      '# HELP army_dispatcher_queue_depth Pending + in_progress orders',
      '# TYPE army_dispatcher_queue_depth gauge',
      'army_dispatcher_queue_depth ' + (pendingOrders + inProgressOrders),
      '# HELP army_dispatch_errors Dispatch delivery errors',
      '# TYPE army_dispatch_errors counter',
      'army_dispatch_errors ' + metrics.dispatchErrors,
    ];
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(lines.join('\n'));
    return;
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.error('OpenClaw Army server listening on http://localhost:' + PORT);
  console.error('  GET  /health');
  console.error('  POST /army/register   GET /army/nodes   GET /army/nodes/:id   PATCH /army/nodes/:id');
  console.error('  GET  /army/units');
  console.error('  POST /army/orders     GET /army/orders?status=');
  console.error('  GET  /metrics');
  if (!store) console.error('  WARN: Store not available (set MESH_STORE_DB_PATH)');
  if (store && REGISTRY_TTL_SEC > 0) {
    setInterval(() => {
      try {
        store.markStaleRegistryNodesOffline(REGISTRY_TTL_SEC);
      } catch (e) {
        console.error('Army registry TTL job error:', e.message);
      }
    }, 60000);
  }
  if (store) {
    setInterval(() => {
      try {
        store.markOrdersDeadlineExceeded();
      } catch (e) {
        console.error('Army deadline-exceeded job error:', e.message);
      }
    }, 60000);
  }
});
