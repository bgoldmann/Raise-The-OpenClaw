/**
 * Army server — registry, orders, health, metrics (integration)
 * Run: node --test test/army-server.test.js
 * Requires better-sqlite3. Uses temp SQLite DB; spawns server on port 40999.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..');
const ARMY_SCRIPT = path.join(REPO_ROOT, 'army', 'server.js');
const ARMY_PORT = 40999;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(baseUrl, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(baseUrl + '/health');
      if (res.ok) return await res.json();
    } catch (_) {}
    await wait(200);
  }
  return null;
}

describe('Army server', () => {
  let serverProc;
  let baseUrl;
  let tempDbPath;
  let storeAvailable = false;

  before(async () => {
    tempDbPath = path.join(os.tmpdir(), 'army-test-' + Date.now() + '.sqlite');
    serverProc = spawn(process.execPath, [ARMY_SCRIPT, String(ARMY_PORT)], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        MESH_STORE_DB_PATH: tempDbPath,
        PORT: String(ARMY_PORT),
        ARMY_METRICS: '1',
      },
      stdio: 'pipe',
    });
    baseUrl = 'http://127.0.0.1:' + ARMY_PORT;
    const health = await waitForHealth(baseUrl);
    assert.ok(health, 'Server should respond on /health');
    assert.strictEqual(health.ok, true);
    storeAvailable = health.storeAvailable === true;
  });

  after(() => {
    if (serverProc) serverProc.kill();
    try {
      if (tempDbPath && fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch (_) {}
  });

  it('GET /health returns service and storeAvailable', async () => {
    const res = await fetch(baseUrl + '/health');
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.service, 'openclaw-army');
    assert.strictEqual(typeof data.storeAvailable, 'boolean');
  });

  it('POST /army/register and GET /army/nodes', async function () {
    if (!storeAvailable) return this.skip();
    const body = {
      gateway_id: 'sec',
      rank: 'sergeant',
      unit: 'squad-1',
      skills: ['research', 'report_up'],
      ingest_url: 'http://localhost:4077/ingest',
    };
    const reg = await fetch(baseUrl + '/army/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.strictEqual(reg.status, 200);
    const node = await reg.json();
    assert.strictEqual(node.gateway_id, 'sec');
    assert.strictEqual(node.unit, 'squad-1');
    assert.ok(Array.isArray(node.skills));

    const list = await fetch(baseUrl + '/army/nodes');
    assert.strictEqual(list.status, 200);
    const nodes = await list.json();
    assert.ok(Array.isArray(nodes));
    assert.ok(nodes.length >= 1);
    assert.ok(nodes.some((n) => n.gateway_id === 'sec'));

    const byUnit = await fetch(baseUrl + '/army/nodes?unit=squad-1');
    assert.strictEqual(byUnit.status, 200);
    const unitNodes = await byUnit.json();
    assert.ok(unitNodes.every((n) => n.unit === 'squad-1'));

    const bySkill = await fetch(baseUrl + '/army/nodes?skill=research');
    assert.strictEqual(bySkill.status, 200);
    const skillNodes = await bySkill.json();
    assert.ok(skillNodes.every((n) => n.skills && n.skills.includes('research')));
  });

  it('GET /army/nodes/:id and PATCH /army/nodes/:id', async function () {
    if (!storeAvailable) return this.skip();
    const getRes = await fetch(baseUrl + '/army/nodes/sec');
    assert.strictEqual(getRes.status, 200);
    const node = await getRes.json();
    assert.strictEqual(node.id, 'sec');

    const patchRes = await fetch(baseUrl + '/army/nodes/sec', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'available', capacity: 2 }),
    });
    assert.strictEqual(patchRes.status, 200);
    const updated = await patchRes.json();
    assert.strictEqual(updated.capacity, 2);
  });

  it('GET /army/units', async function () {
    if (!storeAvailable) return this.skip();
    const res = await fetch(baseUrl + '/army/units');
    assert.strictEqual(res.status, 200);
    const units = await res.json();
    assert.ok(Array.isArray(units));
    assert.ok(units.length >= 1);
  });

  it('POST /army/orders and GET /army/orders', async function () {
    if (!storeAvailable) return this.skip();
    const orderBody = {
      addressee: 'sec',
      payload: 'Test task',
      priority: 'normal',
    };
    const postRes = await fetch(baseUrl + '/army/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderBody),
    });
    assert.strictEqual(postRes.status, 202);
    const created = await postRes.json();
    assert.ok(created.orderId);
    assert.ok(created.status === 'pending' || created.status === 'failed');

    const listRes = await fetch(baseUrl + '/army/orders');
    assert.strictEqual(listRes.status, 200);
    const orders = await listRes.json();
    assert.ok(Array.isArray(orders));
    assert.ok(orders.some((o) => o.order_id === created.orderId));
  });

  it('PATCH /army/orders/:orderId (report_up) and roles learning hook', async function () {
    if (!storeAvailable) return this.skip();
    const orderBody = { addressee: 'sec', payload: 'Report-up test', priority: 'low' };
    const postRes = await fetch(baseUrl + '/army/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderBody),
    });
    assert.strictEqual(postRes.status, 202);
    const { orderId } = await postRes.json();

    const patchRes = await fetch(baseUrl + '/army/orders/' + encodeURIComponent(orderId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', result: 'Done' }),
    });
    assert.strictEqual(patchRes.status, 200);
    const updated = await patchRes.json();
    assert.strictEqual(updated.status, 'completed');
    assert.strictEqual(updated.result, 'Done');

    const { openStore } = require(path.join(REPO_ROOT, 'mesh', 'store', 'client.js'));
    const testStore = openStore(tempDbPath);
    if (testStore) {
      const byRole = testStore.getMemory('mesh', 'lessons_by_role:unknown');
      const byNode = testStore.getMemory('node', (updated.target_node_id || 'unknown') + ':lessons');
      const list = byRole?.value || byNode?.value;
      assert.ok(Array.isArray(list), 'learning hook should write lessons to mesh memory');
      const lesson = list.find((l) => l.orderId === orderId);
      assert.ok(lesson, 'lesson should exist for this order');
      assert.strictEqual(lesson.outcome, 'completed');
      assert.ok(lesson.summary.includes('Done') || lesson.summary === 'Completed.');
    }
  });

  it('GET /metrics returns Prometheus-style counters', async function () {
    if (!storeAvailable) return this.skip();
    const res = await fetch(baseUrl + '/metrics');
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('army_orders_total'));
    assert.ok(text.includes('army_registry_nodes'));
    assert.ok(text.includes('army_dispatcher_queue_depth'));
  });

  it('GET /army/nodes/:id returns 404 for unknown id', async function () {
    if (!storeAvailable) return this.skip();
    const res = await fetch(baseUrl + '/army/nodes/nonexistent-id-xyz');
    assert.strictEqual(res.status, 404);
  });
});
