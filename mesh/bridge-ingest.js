/**
 * OpenClaw Mesh — Ingest mesh messages from bridge payloads (Phase 1)
 * Parses incoming bridge messages and updates local cache for memory/skill.
 */

const { parseMeshMessage, isMemoryMessage, isSkillMessage } = require('./messages.js');
const { ingestMemoryMessage, ingestSkillMessage } = require('./cache.js');

/**
 * Ingest a single mesh message (memory or skill) into the local cache.
 * @param {import('./messages.js').MeshMemoryMessage | import('./messages.js').MeshSkillMessage} msg
 * @param {string} [openclawDir]
 * @returns {'memory' | 'skill' | null} - type ingested, or null if ignored
 */
function ingestOne(msg, openclawDir) {
  if (isMemoryMessage(msg)) {
    ingestMemoryMessage(msg, openclawDir);
    return 'memory';
  }
  if (isSkillMessage(msg)) {
    ingestSkillMessage(msg, openclawDir);
    return 'skill';
  }
  return null;
}

/**
 * Parse bridge payload: may be a single message object, or array of messages,
 * or JSON string. Ingests all valid mesh memory/skill messages.
 * @param {string | object | object[]} payload - Raw bridge message body
 * @param {string} [openclawDir]
 * @returns {{ ingested: number, memory: number, skill: number }}
 */
function ingestFromBridge(payload, openclawDir) {
  let messages = [];
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      messages = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      const single = parseMeshMessage(payload);
      if (single) messages = [single];
    }
  } else if (Array.isArray(payload)) {
    messages = payload;
  } else if (payload && typeof payload === 'object') {
    messages = [payload];
  }

  let memory = 0;
  let skill = 0;
  for (const msg of messages) {
    const type = ingestOne(msg, openclawDir);
    if (type === 'memory') memory++;
    if (type === 'skill') skill++;
  }
  return { ingested: memory + skill, memory, skill };
}

module.exports = {
  ingestOne,
  ingestFromBridge,
};
