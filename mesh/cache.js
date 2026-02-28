/**
 * OpenClaw Mesh — Local cache for mesh memory and skills (Phase 1, FR-1.3)
 * Layout: ~/.openclaw/mesh-memory.json, ~/.openclaw/mesh/skills/
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const MESH_MEMORY_FILE = 'mesh-memory.json';
const MESH_SKILLS_DIR = 'mesh';
const SKILLS_SUBDIR = 'skills';

/**
 * @param {string} [openclawDir]
 * @returns {{ memoryPath: string, skillsDir: string }}
 */
function getMeshPaths(openclawDir = DEFAULT_OPENCLAW_DIR) {
  const base = path.resolve(openclawDir);
  return {
    memoryPath: path.join(base, MESH_MEMORY_FILE),
    skillsDir: path.join(base, MESH_SKILLS_DIR, SKILLS_SUBDIR),
  };
}

/**
 * Ensure directory exists; create if needed.
 * @param {string} dir
 */
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}

/**
 * Read mesh memory cache. Returns object keyed by "scope:key" with { value, nodeId, ts }.
 * @param {string} [openclawDir]
 * @returns {Record<string, { value: unknown, nodeId: string, ts: number }>}
 */
function readMeshMemory(openclawDir = DEFAULT_OPENCLAW_DIR) {
  const { memoryPath } = getMeshPaths(openclawDir);
  try {
    const raw = fs.readFileSync(memoryPath, 'utf8');
    const data = JSON.parse(raw);
    return typeof data === 'object' && data !== null ? data : {};
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

/**
 * Write a single memory entry into the local cache (merge with existing).
 * @param {{ scope: string, key: string, value: unknown, nodeId: string, ts: number }} entry
 * @param {string} [openclawDir]
 */
function writeMeshMemoryEntry(entry, openclawDir = DEFAULT_OPENCLAW_DIR) {
  const { memoryPath } = getMeshPaths(openclawDir);
  const baseDir = path.dirname(memoryPath);
  ensureDir(baseDir);

  const current = readMeshMemory(openclawDir);
  const cacheKey = `${entry.scope}:${entry.key}`;
  current[cacheKey] = {
    value: entry.value,
    nodeId: entry.nodeId,
    ts: entry.ts,
  };
  fs.writeFileSync(memoryPath, JSON.stringify(current, null, 2), 'utf8');
}

/**
 * Ingest a mesh memory message into the local cache.
 * @param {import('./messages.js').MeshMemoryMessage} msg
 * @param {string} [openclawDir]
 */
function ingestMemoryMessage(msg, openclawDir = DEFAULT_OPENCLAW_DIR) {
  writeMeshMemoryEntry(
    {
      scope: msg.scope,
      key: msg.key,
      value: msg.value,
      nodeId: msg.nodeId,
      ts: msg.ts,
    },
    openclawDir
  );
}

/**
 * Get one memory value by scope and key, or undefined.
 * @param {string} scope
 * @param {string} key
 * @param {string} [openclawDir]
 * @returns {{ value: unknown, nodeId: string, ts: number } | undefined}
 */
function getMeshMemory(scope, key, openclawDir = DEFAULT_OPENCLAW_DIR) {
  const cache = readMeshMemory(openclawDir);
  return cache[`${scope}:${key}`];
}

/**
 * List skill file names in the local skills dir (no content).
 * @param {string} [openclawDir]
 * @returns {string[]}
 */
function listMeshSkills(openclawDir = DEFAULT_OPENCLAW_DIR) {
  const { skillsDir } = getMeshPaths(openclawDir);
  try {
    const names = fs.readdirSync(skillsDir);
    return names.filter((n) => n.endsWith('.md') || n.endsWith('.txt'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

/**
 * Read a skill by name (file name without path). Returns content or null.
 * @param {string} name - e.g. "triage" -> triage.md or triage.txt
 * @param {string} [openclawDir]
 * @returns {string | null}
 */
function readMeshSkill(name, openclawDir = DEFAULT_OPENCLAW_DIR) {
  const { skillsDir } = getMeshPaths(openclawDir);
  const safeName = path.basename(name).replace(/\.\./g, '');
  for (const ext of ['.md', '.txt', '']) {
    const filePath = path.join(skillsDir, safeName + (ext || ''));
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  return null;
}

/**
 * Write a skill to the local cache (mesh/skills/<name>.md).
 * @param {string} name
 * @param {string} content
 * @param {string} [openclawDir]
 */
function writeMeshSkill(name, content, openclawDir = DEFAULT_OPENCLAW_DIR) {
  const { skillsDir } = getMeshPaths(openclawDir);
  ensureDir(skillsDir);
  const safeName = path.basename(name).replace(/\.\./g, '') || 'unnamed';
  const filePath = path.join(skillsDir, safeName.endsWith('.md') ? safeName : safeName + '.md');
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Ingest a mesh skill message into the local cache (writes to mesh/skills/<name>.md).
 * @param {import('./messages.js').MeshSkillMessage} msg
 * @param {string} [openclawDir]
 */
function ingestSkillMessage(msg, openclawDir = DEFAULT_OPENCLAW_DIR) {
  writeMeshSkill(msg.name, msg.content, openclawDir);
}

module.exports = {
  getMeshPaths,
  readMeshMemory,
  writeMeshMemoryEntry,
  ingestMemoryMessage,
  getMeshMemory,
  listMeshSkills,
  readMeshSkill,
  writeMeshSkill,
  ingestSkillMessage,
  DEFAULT_OPENCLAW_DIR,
  MESH_MEMORY_FILE,
  MESH_SKILLS_DIR,
  SKILLS_SUBDIR,
};
