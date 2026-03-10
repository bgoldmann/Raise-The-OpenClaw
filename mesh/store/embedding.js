/**
 * Embedding provider for mesh memory semantic search.
 * Supports Ollama (/api/embed) and OpenAI-compatible APIs (/v1/embeddings).
 *
 * Env: MESH_EMBEDDING_URL (e.g. http://localhost:11434/api/embed for Ollama),
 *      MESH_EMBEDDING_MODEL (e.g. nomic-embed-text, text-embedding-3-small),
 *      MESH_EMBEDDING_DIMENSIONS (optional, model default used if not set).
 */

const http = require('http');
const https = require('https');

const EMBEDDING_URL = process.env.MESH_EMBEDDING_URL || null;
const EMBEDDING_MODEL = process.env.MESH_EMBEDDING_MODEL || 'nomic-embed-text';
const EMBEDDING_DIMENSIONS = process.env.MESH_EMBEDDING_DIMENSIONS ? parseInt(process.env.MESH_EMBEDDING_DIMENSIONS, 10) : null;

/** @returns {boolean} */
function isConfigured() {
  return !!EMBEDDING_URL;
}

/**
 * Fetch embedding for text from configured API.
 * @param {string} text - Text to embed
 * @returns {Promise<Float32Array | null>} Embedding vector or null on error
 */
async function embed(text) {
  if (!EMBEDDING_URL || !text || typeof text !== 'string') return null;
  const trimmed = text.trim().slice(0, 32000);
  if (!trimmed) return null;

  const isOllama = EMBEDDING_URL.includes('/api/embed');
  const body = isOllama
    ? JSON.stringify({ model: EMBEDDING_MODEL, input: trimmed })
    : JSON.stringify({
        model: EMBEDDING_MODEL,
        input: trimmed,
        ...(EMBEDDING_DIMENSIONS && { dimensions: EMBEDDING_DIMENSIONS }),
      });

  const url = new URL(EMBEDDING_URL);
  const opts = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname || (isOllama ? '/api/embed' : '/v1/embeddings'),
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body, 'utf8') },
  };

  return new Promise((resolve) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          let vec;
          if (isOllama) {
            vec = data.embeddings?.[0];
          } else {
            vec = data.data?.[0]?.embedding;
          }
          if (Array.isArray(vec) && vec.length > 0) {
            resolve(new Float32Array(vec));
          } else {
            resolve(null);
          }
        } catch (_) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(30000, () => {
      req.destroy();
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

/**
 * Embed text synchronously by deferring to async. For use in sync contexts, returns null;
 * caller should use embed() when async is available.
 * @deprecated Use embed() instead.
 */
function embedSync(/* text */) {
  return null;
}

module.exports = {
  isConfigured,
  embed,
  embedSync,
  getDimensions: () => EMBEDDING_DIMENSIONS,
};
