/**
 * OpenClaw Mesh — Optional message signing and verification (ENTERPRISE_EXPAND §5)
 * Canonical JSON of mesh message fields, signed with Ed25519. Use when bridge or federation is untrusted.
 */

const crypto = require('crypto');

/**
 * Build canonical string for signing (deterministic JSON, keys sorted). Excludes sig.
 * Memory: type, scope, key, value, nodeId, ts. Skill: type, name, sourceNode, content, ts.
 * @param {object} msg - Mesh memory or skill message
 * @returns {string}
 */
function canonicalMessage(msg) {
  const o = { ...msg };
  delete o.sig;
  delete o.signature;
  const keys = Object.keys(o).sort();
  const out = {};
  for (const k of keys) out[k] = o[k];
  return JSON.stringify(out);
}

/**
 * Sign a mesh message. Adds sig (base64) to the message.
 * @param {object} msg - Mesh memory or skill message (will be mutated)
 * @param {string|Buffer} privateKeyPem - PEM or key object
 * @returns {object} msg with sig added
 */
function signMessage(msg, privateKeyPem) {
  const data = canonicalMessage(msg);
  const key = typeof privateKeyPem === 'string' || Buffer.isBuffer(privateKeyPem)
    ? crypto.createPrivateKey(privateKeyPem) : privateKeyPem;
  const sig = crypto.sign(null, Buffer.from(data, 'utf8'), key);
  msg.sig = sig.toString('base64');
  return msg;
}

/**
 * Verify a mesh message's sig. Returns true if valid, false if missing or invalid.
 * @param {object} msg - Mesh message with sig
 * @param {string|Buffer} publicKeyPem - PEM or key object
 * @returns {boolean}
 */
function verifyMessage(msg, publicKeyPem) {
  const sigB64 = msg.sig || msg.signature;
  if (!sigB64) return false;
  const data = canonicalMessage(msg);
  const key = typeof publicKeyPem === 'string' || Buffer.isBuffer(publicKeyPem)
    ? crypto.createPublicKey(publicKeyPem) : publicKeyPem;
  try {
    return crypto.verify(null, Buffer.from(data, 'utf8'), key, Buffer.from(sigB64, 'base64'));
  } catch {
    return false;
  }
}

module.exports = {
  canonicalMessage,
  signMessage,
  verifyMessage,
};
