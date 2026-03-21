/**
 * mesh-git-import: LWW merge into local cache (no SQLite).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { runImport } = require('../scripts/mesh-git-import.js');
const cache = require('../mesh/cache.js');

function mkExportDir(layout) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-git-import-'));
  for (const [rel, content] of Object.entries(layout)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8');
  }
  return dir;
}

test('imports memory and applies LWW by updated_at', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-home-'));
  const exp = mkExportDir({
    'memory/mesh/a.json': {
      key: 'k1',
      node_id: 'n1',
      scope: 'mesh',
      updated_at: 100,
      value: { v: 1 },
    },
  });

  runImport({ importDir: exp, openclawDir: home });
  const r = cache.getMeshMemory('mesh', 'k1', home);
  assert.strictEqual(r.value.v, 1);
  assert.strictEqual(r.ts, 100);

  const expOlder = mkExportDir({
    'memory/mesh/a.json': {
      key: 'k1',
      node_id: 'n2',
      scope: 'mesh',
      updated_at: 50,
      value: { v: 2 },
    },
  });
  runImport({ importDir: expOlder, openclawDir: home });
  assert.strictEqual(cache.getMeshMemory('mesh', 'k1', home).value.v, 1);

  const expNewer = mkExportDir({
    'memory/mesh/a.json': {
      key: 'k1',
      node_id: 'n3',
      scope: 'mesh',
      updated_at: 200,
      value: { v: 3 },
    },
  });
  runImport({ importDir: expNewer, openclawDir: home });
  assert.strictEqual(cache.getMeshMemory('mesh', 'k1', home).value.v, 3);
  assert.strictEqual(cache.getMeshMemory('mesh', 'k1', home).ts, 200);
});

test('imports skills with LWW by mesh-skills-import-state.json updated_at', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-home-sk-'));
  const exp1 = mkExportDir({
    'skills/triage.json': {
      name: 'triage',
      source_node: 'ceo',
      updated_at: 1000,
      content: '# v1',
    },
  });
  runImport({ importDir: exp1, openclawDir: home });
  assert.strictEqual(cache.readMeshSkill('triage', home).trim(), '# v1');

  const exp2 = mkExportDir({
    'skills/triage.json': {
      name: 'triage',
      source_node: 'ceo',
      updated_at: 500,
      content: '# v2',
    },
  });
  runImport({ importDir: exp2, openclawDir: home });
  assert.strictEqual(cache.readMeshSkill('triage', home).trim(), '# v1');

  const exp3 = mkExportDir({
    'skills/triage.json': {
      name: 'triage',
      source_node: 'ceo',
      updated_at: 2000,
      content: '# v3',
    },
  });
  runImport({ importDir: exp3, openclawDir: home });
  assert.strictEqual(cache.readMeshSkill('triage', home).trim(), '# v3');
});
