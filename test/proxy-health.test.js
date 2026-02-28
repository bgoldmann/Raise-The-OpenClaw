/**
 * Mission Control proxy — health and gateways endpoints (integration)
 * Run: node --test test/proxy-health.test.js
 * Spawns the proxy on port 30999, then fetches /health and /api/gateways.
 */

const { it } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PROXY_DIR = path.join(REPO_ROOT, 'mission-control', 'proxy');
const PROXY_PORT = 30999;
const PROXY_SCRIPT = path.join(PROXY_DIR, 'server.js');

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      return { ok: res.ok, status: res.status, body: text };
    } catch (_) {
      await wait(200);
    }
  }
  return null;
}

it('proxy starts and responds on /health and /api/gateways', async () => {
  const proc = spawn(process.execPath, [PROXY_SCRIPT, String(PROXY_PORT)], {
    cwd: PROXY_DIR,
    env: { ...process.env, PORT: String(PROXY_PORT) },
    stdio: 'pipe',
  });
  try {
    await wait(600);
    const health = await fetchWithRetry(`http://127.0.0.1:${PROXY_PORT}/health`);
    assert.ok(health, 'Proxy should respond on /health');
    assert.strictEqual(health.status, 200);
    const healthData = JSON.parse(health.body);
    assert.strictEqual(healthData.ok, true);
    assert.strictEqual(typeof healthData.gateways, 'number');

    const gwRes = await fetch(`http://127.0.0.1:${PROXY_PORT}/api/gateways`);
    assert.strictEqual(gwRes.status, 200);
    const gwData = await gwRes.json();
    assert.ok(Array.isArray(gwData.gateways));
  } finally {
    proc.kill();
  }
});
