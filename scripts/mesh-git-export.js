#!/usr/bin/env node
/**
 * Export mesh memory and skills from SQLite to a deterministic JSON tree for Git backup.
 *
 *   MESH_STORE_DB_PATH=/path/to/store.sqlite MESH_GIT_EXPORT_DIR=./export node scripts/mesh-git-export.js
 *
 * Env:
 *   MESH_STORE_DB_PATH — required
 *   MESH_GIT_EXPORT_DIR — output root (default: ./mesh-git-export)
 *   MESH_GIT_EXPORT_SCOPES — comma-separated scopes, or "all" (default: mesh)
 *   MESH_GIT_EXPORT_KEY_PREFIX — optional comma-separated prefixes; if set, only keys starting with one
 *   MESH_GIT_EXPORT_SKILLS — 0 to skip skills (default: 1)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { openStore } = require(path.join(__dirname, '..', 'mesh', 'store', 'client.js'));

function safeSegment(s, maxLen = 140) {
  if (s == null || s === '') return 'empty';
  let t = String(s).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (t.length > maxLen) {
    const h = crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);
    t = t.slice(0, Math.max(20, maxLen - 13)) + '_' + h;
  }
  return t;
}

function rmDirContents(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      rmDirContents(p);
      fs.rmdirSync(p);
    } else {
      fs.unlinkSync(p);
    }
  }
}

/**
 * @param {object} opts
 * @param {string} opts.dbPath
 * @param {string} opts.exportDir
 * @param {string} [opts.scopes] — default mesh; "all" for every scope
 * @param {string[]} [opts.keyPrefixes] — if non-empty, filter keys
 * @param {boolean} [opts.includeSkills] — default true
 * @returns {{ memoryCount: number, skillCount: number, exportDir: string } | null}
 */
function runExport(opts = {}) {
  const dbPath = opts.dbPath || process.env.MESH_STORE_DB_PATH;
  const exportDir = path.resolve(opts.exportDir || process.env.MESH_GIT_EXPORT_DIR || './mesh-git-export');
  const scopesRaw = opts.scopes != null ? opts.scopes : process.env.MESH_GIT_EXPORT_SCOPES || 'mesh';
  const prefixEnv = opts.keyPrefixes != null ? opts.keyPrefixes.join(',') : process.env.MESH_GIT_EXPORT_KEY_PREFIX;
  const keyPrefixes = prefixEnv
    ? String(prefixEnv)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const includeSkills =
    opts.includeSkills !== undefined
      ? opts.includeSkills
      : process.env.MESH_GIT_EXPORT_SKILLS !== '0';

  if (!dbPath) {
    console.error('Set MESH_STORE_DB_PATH');
    return null;
  }

  const store = openStore(dbPath);
  if (!store) {
    console.error('Store not available (better-sqlite3 required)');
    return null;
  }

  const memoryRoot = path.join(exportDir, 'memory');
  const skillsRoot = path.join(exportDir, 'skills');
  rmDirContents(memoryRoot);
  rmDirContents(skillsRoot);
  fs.mkdirSync(memoryRoot, { recursive: true });
  fs.mkdirSync(skillsRoot, { recursive: true });

  let rows = [];
  const sr = String(scopesRaw).trim().toLowerCase();
  if (sr === 'all' || sr === '*') {
    rows = store.listMemory(null);
  } else {
    const scopes = String(scopesRaw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const scope of scopes) {
      rows.push(...store.listMemory(scope));
    }
  }

  if (keyPrefixes.length) {
    rows = rows.filter((r) => keyPrefixes.some((p) => r.key.startsWith(p)));
  }

  rows.sort((a, b) => {
    const c = a.scope.localeCompare(b.scope);
    if (c !== 0) return c;
    return a.key.localeCompare(b.key);
  });

  let memoryCount = 0;
  for (const r of rows) {
    const scopeDir = path.join(memoryRoot, safeSegment(r.scope));
    fs.mkdirSync(scopeDir, { recursive: true });
    const base = safeSegment(r.key);
    let fp = path.join(scopeDir, base + '.json');
    let suf = 0;
    while (fs.existsSync(fp)) {
      suf++;
      fp = path.join(scopeDir, base + '_' + suf + '.json');
    }
    const filePath = fp;
    const payload = {
      key: r.key,
      node_id: r.node_id,
      scope: r.scope,
      updated_at: r.updated_at,
      value: r.value,
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    memoryCount++;
  }

  let skillCount = 0;
  if (includeSkills) {
    const skillRows = store.listSkills().filter((s) => s.content);
    skillRows.sort((a, b) => a.name.localeCompare(b.name));
    for (const s of skillRows) {
      const base = safeSegment(s.name);
      const metaPath = path.join(skillsRoot, base + '.json');
      const skillPayload = {
        content: s.content,
        name: s.name,
        source_node: s.source_node,
        updated_at: s.updated_at,
      };
      fs.writeFileSync(metaPath, JSON.stringify(skillPayload, null, 2), 'utf8');
      skillCount++;
    }
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    memoryCount,
    skillCount,
    storeVersion: 1,
  };
  fs.writeFileSync(path.join(exportDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`Exported ${memoryCount} memory rows, ${skillCount} skills to ${exportDir}`);
  return { memoryCount, skillCount, exportDir };
}

if (require.main === module) {
  const r = runExport();
  process.exit(r ? 0 : 1);
}

module.exports = { runExport, safeSegment };
