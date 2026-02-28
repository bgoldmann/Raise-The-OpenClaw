#!/usr/bin/env node
/**
 * OpenClaw Mesh — minimal CLI to read/write mesh memory and skills.
 * Uses local cache (~/.openclaw or OPENCLAW_HOME) or store API when MESH_STORE_URL is set.
 *
 * Usage:
 *   node scripts/mesh-cli.js get-memory <scope> <key>
 *   node scripts/mesh-cli.js put-memory <scope> <key> <value-json>
 *   node scripts/mesh-cli.js list-memory [scope]
 *   node scripts/mesh-cli.js get-skill <name>
 *   node scripts/mesh-cli.js put-skill <name> <source-node> [file-path]
 *   node scripts/mesh-cli.js list-skills
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const meshDir = path.join(__dirname, '..', 'mesh');
const openclawDir = process.env.OPENCLAW_HOME || path.join(require('os').homedir(), '.openclaw');
const storeUrl = process.env.MESH_STORE_URL || null;
const storeAuth = process.env.MESH_STORE_AUTH_BEARER || process.env.MESH_STORE_AUTH_SECRET || null;

function storeGet(pathname) {
  return new Promise((resolve, reject) => {
    const u = new URL(storeUrl + pathname);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = {};
    if (storeAuth) headers.Authorization = 'Bearer ' + storeAuth;
    lib.get(storeUrl + pathname, { headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (res.statusCode >= 400) resolve({ error: body.error || 'HTTP ' + res.statusCode });
          else resolve(body);
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', reject);
  });
}

function storePut(pathname, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(storeUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) };
    if (storeAuth) headers.Authorization = 'Bearer ' + storeAuth;
    const req = lib.request(storeUrl + pathname, { method: 'PUT', headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          resolve({});
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const args = process.argv.slice(2);
const cmd = args[0];
if (!cmd || !['get-memory', 'put-memory', 'list-memory', 'get-skill', 'put-skill', 'list-skills'].includes(cmd)) {
  console.error('Usage: mesh-cli.js <get-memory|put-memory|list-memory|get-skill|put-skill|list-skills> ...');
  process.exit(1);
}

(async () => {
  try {
    if (storeUrl) {
      if (cmd === 'get-memory') {
        const [scope, key] = args.slice(1);
        if (!scope || !key) { console.error('Usage: get-memory <scope> <key>'); process.exit(1); }
        const row = await storeGet('/mesh/memory/' + encodeURIComponent(scope) + '/' + encodeURIComponent(key));
        if (row.error) { console.error(row.error); process.exit(1); }
        console.log(JSON.stringify(row.value !== undefined ? row.value : row, null, 2));
      } else if (cmd === 'put-memory') {
        const [scope, key, valueJson] = args.slice(1);
        if (!scope || !key || valueJson === undefined) { console.error('Usage: put-memory <scope> <key> <value-json>'); process.exit(1); }
        const value = JSON.parse(valueJson);
        const row = await storePut('/mesh/memory', { scope, key, value, node_id: process.env.MESH_NODE_ID || 'cli' });
        console.log(JSON.stringify(row, null, 2));
      } else if (cmd === 'list-memory') {
        const scope = args[1] || '';
        const list = await storeGet('/mesh/memory' + (scope ? '?scope=' + encodeURIComponent(scope) : ''));
        console.log(JSON.stringify(Array.isArray(list) ? list : [], null, 2));
      } else if (cmd === 'get-skill') {
        const [name] = args.slice(1);
        if (!name) { console.error('Usage: get-skill <name>'); process.exit(1); }
        const row = await storeGet('/mesh/skills/' + encodeURIComponent(name));
        if (row.error) { console.error(row.error); process.exit(1); }
        console.log(row.content != null ? row.content : JSON.stringify(row, null, 2));
      } else if (cmd === 'put-skill') {
        const [name, sourceNode, filePath] = args.slice(1);
        if (!name || !sourceNode) { console.error('Usage: put-skill <name> <source-node> [file-path]'); process.exit(1); }
        const content = filePath && fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
        const row = await storePut('/mesh/skills', { name, source_node: sourceNode, content, path: filePath || null });
        console.log(JSON.stringify(row, null, 2));
      } else if (cmd === 'list-skills') {
        const list = await storeGet('/mesh/skills');
        console.log(JSON.stringify(Array.isArray(list) ? list : [], null, 2));
      }
    } else {
      const cache = require(path.join(meshDir, 'cache.js'));
      if (cmd === 'get-memory') {
        const [scope, key] = args.slice(1);
        if (!scope || !key) { console.error('Usage: get-memory <scope> <key>'); process.exit(1); }
        const entry = cache.getMeshMemory(scope, key, openclawDir);
        if (!entry) { console.error('Not found'); process.exit(1); }
        console.log(JSON.stringify(entry.value, null, 2));
      } else if (cmd === 'put-memory') {
        const [scope, key, valueJson] = args.slice(1);
        if (!scope || !key || valueJson === undefined) { console.error('Usage: put-memory <scope> <key> <value-json>'); process.exit(1); }
        const value = JSON.parse(valueJson);
        cache.writeMeshMemoryEntry({ scope, key, value, nodeId: process.env.MESH_NODE_ID || 'cli', ts: Math.floor(Date.now() / 1000) }, openclawDir);
        console.log('OK');
      } else if (cmd === 'list-memory') {
        const scope = args[1] || null;
        const data = cache.readMeshMemory(openclawDir);
        const list = Object.entries(data).map(([k, v]) => {
          const [s, key] = k.split(':');
          if (scope && s !== scope) return null;
          return { scope: s, key, ...v };
        }).filter(Boolean);
        console.log(JSON.stringify(list, null, 2));
      } else if (cmd === 'get-skill') {
        const [name] = args.slice(1);
        if (!name) { console.error('Usage: get-skill <name>'); process.exit(1); }
        const content = cache.readMeshSkill(name, openclawDir);
        if (content == null) { console.error('Not found'); process.exit(1); }
        console.log(content);
      } else if (cmd === 'put-skill') {
        const [name, sourceNode, filePath] = args.slice(1);
        if (!name || !sourceNode) { console.error('Usage: put-skill <name> <source-node> [file-path]'); process.exit(1); }
        const content = filePath && fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
        cache.writeMeshSkill(name, content, openclawDir);
        console.log('OK');
      } else if (cmd === 'list-skills') {
        const names = cache.listMeshSkills(openclawDir);
        console.log(JSON.stringify(names, null, 2));
      }
    }
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
})();
