/**
 * OpenClaw Mesh Phase 3 — Local-first sync (FR-3.1, FR-3.2, FR-3.3)
 * Build sync summary from local cache; merge incoming delta with last-write-wins.
 */

const path = require('path');
const fs = require('fs');
const cache = require(path.join(__dirname, '..', 'cache.js'));
const { createMemoryMessage, createSkillMessage } = require(path.join(__dirname, '..', 'messages.js'));
let hashSummary;
try {
  hashSummary = require(path.join(__dirname, 'hash-summary.js'));
} catch {
  hashSummary = null;
}

/**
 * Get current timestamp for a skill (file mtime in Unix seconds). Returns 0 if no file.
 * @param {string} name
 * @param {string} [openclawDir]
 * @returns {number}
 */
function getSkillTs(name, openclawDir) {
  const { skillsDir } = cache.getMeshPaths(openclawDir);
  const base = path.basename(name).replace(/\.\./g, '');
  for (const ext of ['.md', '.txt', '']) {
    const filePath = path.join(skillsDir, base + (ext || ''));
    try {
      const stat = fs.statSync(filePath);
      return Math.floor(stat.mtimeMs / 1000);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  return 0;
}

/**
 * Build a sync_summary from the local replica (FR-3.1, FR-3.3).
 * @param {string} nodeId
 * @param {string} [openclawDir]
 * @param {{ includeHash?: boolean }} [options]
 * @returns {{ type: 'sync_summary', nodeId: string, ts: number, memory: Array<{scope, key, ts, h?: string}>, skills: Array<{name, ts, h?: string}> }}
 */
function buildSummary(nodeId, openclawDir, options = {}) {
  const includeHash = options.includeHash && hashSummary;
  const mem = cache.readMeshMemory(openclawDir);
  const memory = [];
  for (const [cacheKey, entry] of Object.entries(mem)) {
    const colon = cacheKey.indexOf(':');
    if (colon < 0) continue;
    const scope = cacheKey.slice(0, colon);
    const key = cacheKey.slice(colon + 1);
    const row = { scope, key, ts: entry.ts };
    if (includeHash) row.h = hashSummary.hashValue(entry.value);
    memory.push(row);
  }
  const skillNames = cache.listMeshSkills(openclawDir).map((n) => n.replace(/\.(md|txt)$/, ''));
  const skills = [];
  for (const name of skillNames) {
    const ts = getSkillTs(name, openclawDir);
    const row = { name, ts };
    if (includeHash) {
      const content = cache.readMeshSkill(name, openclawDir);
      row.h = content ? hashSummary.hashString(content) : '';
    }
    skills.push(row);
  }
  return {
    type: 'sync_summary',
    nodeId,
    ts: Math.floor(Date.now() / 1000),
    memory,
    skills,
  };
}

/**
 * Merge incoming sync_delta into local cache with last-write-wins (FR-3.2).
 * @param {{ memory?: Array<{scope, key, value, nodeId, ts}>, skills?: Array<{name, sourceNode, content, ts}> }} delta
 * @param {string} [openclawDir]
 * @returns {{ memoryWritten: number, skillsWritten: number }}
 */
function mergeDelta(delta, openclawDir) {
  let memoryWritten = 0;
  let skillsWritten = 0;
  const mem = delta.memory || [];
  for (const entry of mem) {
    const existing = cache.getMeshMemory(entry.scope, entry.key, openclawDir);
    if (existing && existing.ts >= entry.ts) continue;
    cache.writeMeshMemoryEntry(
      {
        scope: entry.scope,
        key: entry.key,
        value: entry.value,
        nodeId: entry.nodeId || 'unknown',
        ts: entry.ts,
      },
      openclawDir
    );
    memoryWritten++;
  }
  const sk = delta.skills || [];
  for (const s of sk) {
    const existingTs = getSkillTs(s.name, openclawDir);
    if (existingTs >= (s.ts || 0)) continue;
    if (s.content) {
      cache.writeMeshSkill(s.name, s.content, openclawDir);
      skillsWritten++;
    }
  }
  return { memoryWritten, skillsWritten };
}

/**
 * From a peer's sync_summary, compute what we need to request (keys/names where peer has newer or we're missing).
 * @param {{ memory: Array<{scope, key, ts, h?}>, skills: Array<{name, ts, h?}> }} summary
 * @param {string} [openclawDir]
 * @param {{ byHash?: boolean }} [options] - If true, also skip when our hash matches (need full replica to compute hash)
 * @returns {{ memory: Array<[scope, key]>, skills: string[] }}
 */
function computeRequest(summary, openclawDir, options = {}) {
  const memory = [];
  const localMem = cache.readMeshMemory(openclawDir);
  for (const row of summary.memory || []) {
    const cacheKey = `${row.scope}:${row.key}`;
    const local = localMem[cacheKey];
    if (!local || local.ts < row.ts) memory.push([row.scope, row.key]);
  }
  const skills = [];
  for (const row of summary.skills || []) {
    const localTs = getSkillTs(row.name, openclawDir);
    if (localTs < (row.ts || 0)) skills.push(row.name);
  }
  return { memory, skills };
}

/**
 * Build sync_delta payload for requested memory keys and skill names (from local cache).
 * @param {{ memory: Array<[scope, key]>, skills: string[] }} request
 * @param {string} nodeId
 * @param {string} [openclawDir]
 * @param {string} [requestId]
 * @returns {{ type: 'sync_delta', requestId?: string, nodeId: string, memory: Array, skills: Array }}
 */
function buildDelta(request, nodeId, openclawDir, requestId) {
  const memory = [];
  for (const [scope, key] of request.memory || []) {
    const entry = cache.getMeshMemory(scope, key, openclawDir);
    if (entry) memory.push({ scope, key, value: entry.value, nodeId: entry.nodeId, ts: entry.ts });
  }
  const skills = [];
  for (const name of request.skills || []) {
    const content = cache.readMeshSkill(name, openclawDir);
    if (content) skills.push({ name, sourceNode: nodeId, content, ts: getSkillTs(name, openclawDir) });
  }
  const out = { type: 'sync_delta', nodeId, memory, skills };
  if (requestId) out.requestId = requestId;
  return out;
}

module.exports = {
  buildSummary,
  mergeDelta,
  computeRequest,
  buildDelta,
  getSkillTs,
};
