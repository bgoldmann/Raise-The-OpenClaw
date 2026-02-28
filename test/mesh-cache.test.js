/**
 * Mesh cache — read/write memory and skills with temp dir (Phase 1)
 * Run: node --test test/mesh-cache.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cache = require('../mesh/cache.js');
const messages = require('../mesh/messages.js');

function mkTempDir() {
  const dir = path.join(os.tmpdir(), 'openclaw-mesh-test-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('mesh cache memory', () => {
  it('writeMeshMemoryEntry and readMeshMemory round-trip', () => {
    const openclawDir = mkTempDir();
    cache.writeMeshMemoryEntry(
      { scope: 'mesh', key: 'k1', value: { x: 42 }, nodeId: 'n1', ts: 12345 },
      openclawDir
    );
    const data = cache.readMeshMemory(openclawDir);
    assert.strictEqual(data['mesh:k1'].value.x, 42);
  });

  it('getMeshMemory returns entry by scope and key', () => {
    const openclawDir = mkTempDir();
    cache.writeMeshMemoryEntry(
      { scope: 'node', key: 'pref', value: 'short', nodeId: 'n', ts: 1 },
      openclawDir
    );
    const entry = cache.getMeshMemory('node', 'pref', openclawDir);
    assert.strictEqual(entry.value, 'short');
    assert.strictEqual(cache.getMeshMemory('node', 'missing', openclawDir), undefined);
  });

  it('readMeshMemory returns empty object when file missing', () => {
    const openclawDir = mkTempDir();
    assert.deepStrictEqual(cache.readMeshMemory(openclawDir), {});
  });
});

describe('mesh cache skills', () => {
  it('writeMeshSkill and readMeshSkill round-trip', () => {
    const openclawDir = mkTempDir();
    cache.writeMeshSkill('triage', '# Triage rules', openclawDir);
    assert.strictEqual(cache.readMeshSkill('triage', openclawDir), '# Triage rules');
  });

  it('readMeshSkill returns null for missing skill', () => {
    const openclawDir = mkTempDir();
    assert.strictEqual(cache.readMeshSkill('nonexistent', openclawDir), null);
  });
});

describe('ingest into cache', () => {
  it('ingestMemoryMessage writes to cache', () => {
    const openclawDir = mkTempDir();
    const msg = messages.createMemoryMessage({
      scope: 'mesh',
      key: 'ingested',
      value: { ok: true },
      nodeId: 'sec',
    });
    cache.ingestMemoryMessage(msg, openclawDir);
    const entry = cache.getMeshMemory('mesh', 'ingested', openclawDir);
    assert.strictEqual(entry.value.ok, true);
  });

  it('ingestSkillMessage writes skill file', () => {
    const openclawDir = mkTempDir();
    const msg = messages.createSkillMessage({
      name: 'ingested-skill',
      sourceNode: 'ceo',
      content: 'Skill content',
    });
    cache.ingestSkillMessage(msg, openclawDir);
    assert.strictEqual(cache.readMeshSkill('ingested-skill', openclawDir), 'Skill content');
  });
});
