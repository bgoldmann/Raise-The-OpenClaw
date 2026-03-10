#!/usr/bin/env node
/**
 * Backfill vector embeddings for existing mesh memory rows.
 * Requires MESH_STORE_DB_PATH, MESH_VECTOR_ENABLED=1, MESH_EMBEDDING_URL.
 * Run once after enabling vector search on an existing store.
 *
 *   MESH_STORE_DB_PATH=/path/to/mesh-store.sqlite MESH_VECTOR_ENABLED=1 \
 *   MESH_EMBEDDING_URL=http://localhost:11434/api/embed node scripts/vec-backfill.js
 */

const path = require('path');
const { openStore } = require(path.join(__dirname, '..', 'mesh', 'store', 'client.js'));

const DB_PATH = process.env.MESH_STORE_DB_PATH || null;

async function run() {
  if (!DB_PATH) {
    console.error('Set MESH_STORE_DB_PATH, MESH_VECTOR_ENABLED=1, MESH_EMBEDDING_URL');
    process.exit(1);
  }
  process.env.MESH_VECTOR_ENABLED = '1';
  const store = openStore(DB_PATH);
  if (!store) {
    console.error('Store not available');
    process.exit(1);
  }
  if (typeof store.semanticSearchMemory !== 'function') {
    console.error('Vector search not available (check sqlite-vec, MESH_EMBEDDING_URL)');
    process.exit(1);
  }
  const rows = store.listMemory();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    store.putMemory(r.scope, r.key, r.value, r.node_id);
    if ((i + 1) % 10 === 0) {
      process.stderr.write(` queued ${i + 1}/${rows.length}\r`);
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  console.error(`Queued ${rows.length} memories for vector indexing (async).`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
