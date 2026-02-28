/**
 * Bridge ingest — handleBridgeMessage, ingestFromBridge with temp cache
 * Run: node --test test/bridge-ingest.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { handleBridgeMessage } = require('../bridge/adapter.js');
const { ingestFromBridge } = require('../mesh/bridge-ingest.js');
const cache = require('../mesh/cache.js');
const messages = require('../mesh/messages.js');

function mkTempDir() {
  const dir = path.join(os.tmpdir(), 'openclaw-bridge-test-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('ingestFromBridge', () => {
  let openclawDir;

  it('ingests single memory message object', () => {
    openclawDir = mkTempDir();
    const msg = messages.createMemoryMessage({
      scope: 'mesh',
      key: 'bridge-k',
      value: { from: 'bridge' },
      nodeId: 'node1',
    });
    const result = ingestFromBridge(msg, openclawDir);
    assert.strictEqual(result.ingested, 1);
    assert.strictEqual(result.memory, 1);
    assert.strictEqual(result.skill, 0);
    const entry = cache.getMeshMemory('mesh', 'bridge-k', openclawDir);
    assert.ok(entry);
    assert.strictEqual(entry.value.from, 'bridge');
  });

  it('ingests JSON string of memory message', () => {
    openclawDir = mkTempDir();
    const msg = messages.createMemoryMessage({
      scope: 'mesh',
      key: 'str-k',
      value: 99,
      nodeId: 'n',
    });
    const result = ingestFromBridge(JSON.stringify(msg), openclawDir);
    assert.strictEqual(result.memory, 1);
    assert.strictEqual(cache.getMeshMemory('mesh', 'str-k', openclawDir).value, 99);
  });

  it('ingests array of memory and skill messages', () => {
    openclawDir = mkTempDir();
    const mem = messages.createMemoryMessage({ scope: 'mesh', key: 'a', value: 1, nodeId: 'n' });
    const skill = messages.createSkillMessage({ name: 's1', sourceNode: 'n', content: 'C' });
    const result = ingestFromBridge([mem, skill], openclawDir);
    assert.strictEqual(result.ingested, 2);
    assert.strictEqual(result.memory, 1);
    assert.strictEqual(result.skill, 1);
    assert.strictEqual(cache.getMeshMemory('mesh', 'a', openclawDir).value, 1);
    assert.strictEqual(cache.readMeshSkill('s1', openclawDir), 'C');
  });

  it('ignores non-mesh messages', () => {
    openclawDir = mkTempDir();
    const result = ingestFromBridge({ type: 'other', foo: 'bar' }, openclawDir);
    assert.strictEqual(result.ingested, 0);
  });
});

describe('handleBridgeMessage', () => {
  let openclawDir;

  it('ingests plain payload and returns counts', () => {
    openclawDir = mkTempDir();
    const msg = messages.createMemoryMessage({
      scope: 'mesh',
      key: 'handle-k',
      value: { handled: true },
      nodeId: 'n',
    });
    const result = handleBridgeMessage(msg, { openclawDir });
    assert.strictEqual(result.ingested, 1);
    assert.strictEqual(result.memory, 1);
    assert.strictEqual(cache.getMeshMemory('mesh', 'handle-k', openclawDir).value.handled, true);
  });

  it('unwrap telegram extracts message text', () => {
    openclawDir = mkTempDir();
    const msg = messages.createMemoryMessage({
      scope: 'mesh',
      key: 'tg-k',
      value: 1,
      nodeId: 'n',
    });
    const payload = { message: { text: JSON.stringify(msg) } };
    const result = handleBridgeMessage(payload, { unwrap: 'telegram', openclawDir });
    assert.strictEqual(result.memory, 1);
    assert.strictEqual(cache.getMeshMemory('mesh', 'tg-k', openclawDir).value, 1);
  });

  it('handleRequest returns mesh_response when request is for memory', () => {
    openclawDir = mkTempDir();
    cache.writeMeshMemoryEntry(
      { scope: 'mesh', key: 'req-key', value: { answer: 42 }, nodeId: 'n', ts: 1 },
      openclawDir
    );
    const req = messages.createMeshRequest({
      requestId: 'req1',
      kind: 'memory',
      nodeId: 'peer',
      scope: 'mesh',
      key: 'req-key',
    });
    const result = handleBridgeMessage(req, {
      handleRequest: true,
      nodeId: 'local',
      openclawDir,
    });
    assert.ok(result.response);
    assert.strictEqual(result.response.type, 'mesh_response');
    assert.strictEqual(result.response.requestId, 'req1');
    assert.strictEqual(result.response.found, true);
    assert.strictEqual(result.response.value.answer, 42);
  });
});
