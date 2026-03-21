#!/usr/bin/env node
/**
 * Import mesh-git-export tree into local Phase 1 cache (~/.openclaw). Last-write-wins by updated_at for memory.
 *
 *   MESH_GIT_IMPORT_DIR=/path/to/cloned-repo OPENCLAW_HOME=~/.openclaw node scripts/mesh-git-import.js
 */

const fs = require('fs');
const path = require('path');

const cache = require(path.join(__dirname, '..', 'mesh', 'cache.js'));

const SKILLS_STATE_FILE = 'mesh-skills-import-state.json';

function readSkillImportState(openclawDir) {
  const p = path.join(openclawDir, SKILLS_STATE_FILE);
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const o = JSON.parse(raw);
    return typeof o === 'object' && o !== null ? o : {};
  } catch (_) {
    return {};
  }
}

function writeSkillImportState(openclawDir, state) {
  const p = path.join(openclawDir, SKILLS_STATE_FILE);
  fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf8');
}

function walkJsonFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkJsonFiles(p, acc);
    else if (name.endsWith('.json') && name !== 'manifest.json') acc.push(p);
  }
  return acc;
}

function isSkillPayload(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.name === 'string' &&
    typeof obj.content === 'string' &&
    typeof obj.updated_at === 'number' &&
    obj.scope === undefined
  );
}

function isMemoryPayload(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.scope === 'string' &&
    typeof obj.key === 'string' &&
    typeof obj.updated_at === 'number' &&
    obj.value !== undefined
  );
}

/**
 * @param {object} opts
 * @param {string} opts.importDir
 * @param {string} [opts.openclawDir]
 * @returns {{ memoryImported: number, memorySkipped: number, skillsImported: number, skillsSkipped: number } | null}
 */
function runImport(opts = {}) {
  const importDir = path.resolve(opts.importDir || process.env.MESH_GIT_IMPORT_DIR || '');
  const openclawDir = opts.openclawDir || process.env.OPENCLAW_HOME || cache.DEFAULT_OPENCLAW_DIR;

  if (!importDir || !fs.existsSync(importDir)) {
    console.error('Set MESH_GIT_IMPORT_DIR to a directory containing memory/ and skills/ (cloned export)');
    return null;
  }

  const memoryRoot = path.join(importDir, 'memory');
  const skillsRoot = path.join(importDir, 'skills');

  let memoryImported = 0;
  let memorySkipped = 0;
  const memFiles = walkJsonFiles(memoryRoot);

  for (const filePath of memFiles) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.warn('Skip invalid JSON:', filePath, e.message);
      continue;
    }
    if (!isMemoryPayload(raw)) continue;

    const existing = cache.getMeshMemory(raw.scope, raw.key, openclawDir);
    if (existing && existing.ts >= raw.updated_at) {
      memorySkipped++;
      continue;
    }

    cache.writeMeshMemoryEntry(
      {
        key: raw.key,
        nodeId: raw.node_id || 'git-import',
        scope: raw.scope,
        ts: raw.updated_at,
        value: raw.value,
      },
      openclawDir
    );
    memoryImported++;
  }

  let skillsImported = 0;
  let skillsSkipped = 0;
  const skillState = readSkillImportState(openclawDir);
  if (fs.existsSync(skillsRoot)) {
    for (const name of fs.readdirSync(skillsRoot)) {
      if (!name.endsWith('.json')) continue;
      const filePath = path.join(skillsRoot, name);
      let raw;
      try {
        raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        console.warn('Skip invalid JSON:', filePath, e.message);
        continue;
      }
      if (!isSkillPayload(raw)) continue;

      const prevTs = skillState[raw.name] || 0;
      if (raw.updated_at <= prevTs) {
        skillsSkipped++;
        continue;
      }

      cache.writeMeshSkill(raw.name, raw.content, openclawDir);
      skillState[raw.name] = raw.updated_at;
      skillsImported++;
    }
    if (skillsImported > 0) writeSkillImportState(openclawDir, skillState);
  }

  console.log(
    `Import: ${memoryImported} memory updated, ${memorySkipped} skipped (newer local); skills ${skillsImported} updated, ${skillsSkipped} skipped`
  );
  return { memoryImported, memorySkipped, skillsImported, skillsSkipped };
}

if (require.main === module) {
  const r = runImport();
  process.exit(r ? 0 : 1);
}

module.exports = { runImport, isMemoryPayload, isSkillPayload };
