/**
 * OpenClaw Bridge — Wire mesh ingest into your real bridge (channel or webhook).
 * Call this when your bridge receives a message; mesh memory/skill get ingested locally.
 * Optional: handle mesh_request by looking up cache and returning mesh_response to send back.
 */

const path = require('path');
const meshDir = path.join(__dirname, '..', 'mesh');
const { ingestFromBridge } = require(path.join(meshDir, 'bridge-ingest.js'));
const cache = require(path.join(meshDir, 'cache.js'));
const messages = require(path.join(meshDir, 'messages.js'));

/**
 * Unwrap common bridge envelopes to get the message body for mesh parsing.
 * Returns the first candidate that looks like JSON or an object with mesh fields.
 */
const defaultUnwrappers = {
  /** Telegram Bot API: update.message.text or update.channel_post.text */
  telegram: (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    const msg = payload.message || payload.channel_post || payload.edited_message;
    if (!msg) return null;
    const text = msg.text || msg.caption;
    if (typeof text === 'string') return text;
    return null;
  },
  /** Discord: body.content or body (if already string) */
  discord: (payload) => {
    if (!payload) return null;
    if (typeof payload === 'string') return payload;
    const content = payload.content ?? payload.body?.content ?? payload.body;
    if (typeof content === 'string') return content;
    if (content && typeof content === 'object' && (content.type === 'memory' || content.type === 'skill')) return content;
    return null;
  },
  /** Generic: payload.body or payload.message or payload */
  generic: (payload) => {
    if (payload == null) return null;
    if (typeof payload === 'string') return payload;
    const body = payload.body ?? payload.message ?? payload.data ?? payload;
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object') return body;
    return null;
  },
};

/**
 * Handle an incoming bridge message: ingest mesh memory/skill and optionally answer mesh_request.
 * @param {string | object | object[]} payload - Raw payload from your bridge (e.g. Telegram update, Discord event, or plain JSON).
 * @param {Object} [options]
 * @param {'telegram'|'discord'|'generic'|function} [options.unwrap] - How to get message body: preset name or function(payload) => body.
 * @param {boolean} [options.handleRequest=false] - If true, when payload is a mesh_request, look up local cache and set result.response (mesh_response) for you to send back.
 * @param {string} [options.nodeId] - This node's id (for mesh_response when handleRequest is true).
 * @param {string} [options.openclawDir] - Override ~/.openclaw for cache.
 * @returns {{ ingested: number, memory: number, skill: number, response?: object }}
 */
function handleBridgeMessage(payload, options = {}) {
  const { unwrap: unwrapOption, handleRequest = false, nodeId = 'local', openclawDir } = options;

  let body = payload;
  if (unwrapOption) {
    const unwrap = typeof unwrapOption === 'function'
      ? unwrapOption
      : defaultUnwrappers[unwrapOption] || defaultUnwrappers.generic;
    body = unwrap(payload);
    if (body === undefined || body === null) body = payload;
  }

  const result = ingestFromBridge(body, openclawDir);

  if (handleRequest && body && typeof body === 'object' && !Array.isArray(body) && messages.isMeshRequest(body)) {
    const req = body;
    let found = false;
    let value;
    let content;
    if (req.kind === 'memory' && req.scope != null && req.key != null) {
      const entry = cache.getMeshMemory(req.scope, req.key, openclawDir);
      if (entry) {
        found = true;
        value = entry.value;
      }
    } else if (req.kind === 'skill' && req.name) {
      content = cache.readMeshSkill(req.name, openclawDir);
      found = content != null;
    }
    result.response = messages.createMeshResponse({
      requestId: req.requestId,
      kind: req.kind,
      nodeId,
      found,
      value,
      content: content ?? undefined,
    });
  }

  return result;
}

module.exports = {
  handleBridgeMessage,
  defaultUnwrappers,
};
