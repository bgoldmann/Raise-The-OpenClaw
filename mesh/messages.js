/**
 * OpenClaw Mesh — Message builders and validators (Phase 1)
 * PRD FR-1.1 (memory), FR-1.2 (skill)
 */

/**
 * @typedef {Object} MeshMemoryMessage
 * @property {'memory'} type
 * @property {string} scope - node | mesh | user:<id>
 * @property {string} key
 * @property {*} value - JSON-serializable
 * @property {string} nodeId
 * @property {number} ts - Unix seconds
 * @property {string} [id]
 * @property {string} [userScope]
 */

/**
 * @typedef {Object} MeshSkillMessage
 * @property {'skill'} type
 * @property {string} name
 * @property {string} sourceNode
 * @property {string} content - body or URL
 * @property {string} [id]
 * @property {number} [ts]
 */

/**
 * Create a mesh memory message (FR-1.1).
 * @param {Object} o
 * @param {string} o.scope - node | mesh | user:<id>
 * @param {string} o.key
 * @param {*} o.value
 * @param {string} o.nodeId
 * @param {number} [o.ts] - defaults to now
 * @param {string} [o.id]
 * @param {string} [o.userScope]
 * @returns {MeshMemoryMessage}
 */
function createMemoryMessage({ scope, key, value, nodeId, ts, id, userScope }) {
  const msg = {
    type: 'memory',
    scope: String(scope),
    key: String(key),
    value,
    nodeId: String(nodeId),
    ts: typeof ts === 'number' ? ts : Math.floor(Date.now() / 1000),
  };
  if (id != null) msg.id = String(id);
  if (userScope != null) msg.userScope = String(userScope);
  return msg;
}

/**
 * Create a mesh skill message (FR-1.2).
 * @param {Object} o
 * @param {string} o.name
 * @param {string} o.sourceNode
 * @param {string} o.content
 * @param {string} [o.id]
 * @param {number} [o.ts]
 * @returns {MeshSkillMessage}
 */
function createSkillMessage({ name, sourceNode, content, id, ts }) {
  const msg = {
    type: 'skill',
    name: String(name),
    sourceNode: String(sourceNode),
    content: String(content),
  };
  if (id != null) msg.id = String(id);
  if (ts != null) msg.ts = ts;
  else msg.ts = Math.floor(Date.now() / 1000);
  return msg;
}

/**
 * Validate memory message shape (required fields only).
 * @param {unknown} msg
 * @returns {msg is MeshMemoryMessage}
 */
function isMemoryMessage(msg) {
  return (
    msg != null &&
    typeof msg === 'object' &&
    msg.type === 'memory' &&
    typeof msg.scope === 'string' &&
    typeof msg.key === 'string' &&
    typeof msg.nodeId === 'string' &&
    typeof msg.ts === 'number'
  );
}

/**
 * Validate skill message shape (required fields only).
 * @param {unknown} msg
 * @returns {msg is MeshSkillMessage}
 */
function isSkillMessage(msg) {
  return (
    msg != null &&
    typeof msg === 'object' &&
    msg.type === 'skill' &&
    typeof msg.name === 'string' &&
    typeof msg.sourceNode === 'string' &&
    typeof msg.content === 'string'
  );
}

/**
 * Parse JSON and return if it's a valid memory or skill message; otherwise null.
 * @param {string} raw
 * @returns {MeshMemoryMessage | MeshSkillMessage | null}
 */
function parseMeshMessage(raw) {
  try {
    const msg = JSON.parse(raw);
    if (isMemoryMessage(msg)) return msg;
    if (isSkillMessage(msg)) return msg;
    return null;
  } catch {
    return null;
  }
}

/** FR-1.4: request/response over bridge */
function createMeshRequest({ requestId, kind, nodeId, scope, key, name, ts }) {
  const msg = {
    type: 'mesh_request',
    requestId: String(requestId),
    kind: kind === 'memory' || kind === 'skill' ? kind : 'memory',
    nodeId: String(nodeId),
    ts: typeof ts === 'number' ? ts : Math.floor(Date.now() / 1000),
  };
  if (scope != null) msg.scope = String(scope);
  if (key != null) msg.key = String(key);
  if (name != null) msg.name = String(name);
  return msg;
}

function createMeshResponse({ requestId, kind, nodeId, found, value, content, ts }) {
  const msg = {
    type: 'mesh_response',
    requestId: String(requestId),
    kind: kind === 'memory' || kind === 'skill' ? kind : 'memory',
    nodeId: String(nodeId),
    found: Boolean(found),
    ts: typeof ts === 'number' ? ts : Math.floor(Date.now() / 1000),
  };
  if (value !== undefined) msg.value = value;
  if (content != null) msg.content = String(content);
  return msg;
}

function isMeshRequest(msg) {
  return (
    msg != null &&
    typeof msg === 'object' &&
    msg.type === 'mesh_request' &&
    typeof msg.requestId === 'string' &&
    (msg.kind === 'memory' || msg.kind === 'skill') &&
    typeof msg.nodeId === 'string'
  );
}

function isMeshResponse(msg) {
  return (
    msg != null &&
    typeof msg === 'object' &&
    msg.type === 'mesh_response' &&
    typeof msg.requestId === 'string' &&
    (msg.kind === 'memory' || msg.kind === 'skill') &&
    typeof msg.nodeId === 'string' &&
    typeof msg.found === 'boolean'
  );
}

module.exports = {
  createMemoryMessage,
  createSkillMessage,
  isMemoryMessage,
  isSkillMessage,
  parseMeshMessage,
  createMeshRequest,
  createMeshResponse,
  isMeshRequest,
  isMeshResponse,
};
