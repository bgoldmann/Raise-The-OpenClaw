/**
 * Mesh messages — create, validate, parse (Phase 1)
 * Run: node --test test/mesh-messages.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  createMemoryMessage,
  createSkillMessage,
  isMemoryMessage,
  isSkillMessage,
  parseMeshMessage,
  createMeshRequest,
  createMeshResponse,
  isMeshRequest,
  isMeshResponse,
} = require('../mesh/messages.js');

describe('createMemoryMessage', () => {
  it('builds memory message with required fields', () => {
    const msg = createMemoryMessage({
      scope: 'mesh',
      key: 'test',
      value: { x: 1 },
      nodeId: 'node1',
    });
    assert.strictEqual(msg.type, 'memory');
    assert.strictEqual(msg.scope, 'mesh');
    assert.strictEqual(msg.key, 'test');
    assert.deepStrictEqual(msg.value, { x: 1 });
    assert.strictEqual(msg.nodeId, 'node1');
    assert.strictEqual(typeof msg.ts, 'number');
  });

  it('accepts optional id and userScope', () => {
    const msg = createMemoryMessage({
      scope: 'user:alice',
      key: 'k',
      value: null,
      nodeId: 'n',
      id: 'id-1',
      userScope: 'alice',
    });
    assert.strictEqual(msg.id, 'id-1');
    assert.strictEqual(msg.userScope, 'alice');
  });
});

describe('createSkillMessage', () => {
  it('builds skill message with required fields', () => {
    const msg = createSkillMessage({
      name: 'triage',
      sourceNode: 'ceo',
      content: '# Triage\nRules here.',
    });
    assert.strictEqual(msg.type, 'skill');
    assert.strictEqual(msg.name, 'triage');
    assert.strictEqual(msg.sourceNode, 'ceo');
    assert.strictEqual(msg.content, '# Triage\nRules here.');
    assert.strictEqual(typeof msg.ts, 'number');
  });
});

describe('isMemoryMessage', () => {
  it('returns true for valid memory message', () => {
    const msg = createMemoryMessage({ scope: 'mesh', key: 'k', value: 1, nodeId: 'n' });
    assert.strictEqual(isMemoryMessage(msg), true);
  });

  it('returns false for skill message', () => {
    const msg = createSkillMessage({ name: 'x', sourceNode: 'n', content: 'c' });
    assert.strictEqual(isMemoryMessage(msg), false);
  });

  it('returns false for null or invalid shape', () => {
    assert.strictEqual(isMemoryMessage(null), false);
    assert.strictEqual(isMemoryMessage({ type: 'memory', scope: 's', key: 'k' }), false);
  });
});

describe('isSkillMessage', () => {
  it('returns true for valid skill message', () => {
    const msg = createSkillMessage({ name: 'x', sourceNode: 'n', content: 'c' });
    assert.strictEqual(isSkillMessage(msg), true);
  });
});

describe('parseMeshMessage', () => {
  it('parses valid memory JSON string', () => {
    const raw = JSON.stringify(
      createMemoryMessage({ scope: 'mesh', key: 'k', value: 1, nodeId: 'n' })
    );
    const msg = parseMeshMessage(raw);
    assert.ok(msg);
    assert.strictEqual(msg.type, 'memory');
  });

  it('returns null for invalid JSON', () => {
    assert.strictEqual(parseMeshMessage('not json'), null);
  });
});

describe('mesh request/response', () => {
  it('createMeshRequest and isMeshRequest', () => {
    const req = createMeshRequest({ requestId: 'r1', kind: 'memory', nodeId: 'n', scope: 'mesh', key: 'k' });
    assert.strictEqual(req.type, 'mesh_request');
    assert.strictEqual(isMeshRequest(req), true);
  });

  it('createMeshResponse and isMeshResponse', () => {
    const res = createMeshResponse({ requestId: 'r1', kind: 'memory', nodeId: 'n', found: true, value: { a: 1 } });
    assert.strictEqual(res.found, true);
    assert.strictEqual(isMeshResponse(res), true);
  });
});
