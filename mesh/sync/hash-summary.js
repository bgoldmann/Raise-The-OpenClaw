/**
 * Phase 3 — Hash summary for sync efficiency (FR-3.3)
 * Optional: compute short hash of value/content so peers can skip transfer when hashes match.
 */

const crypto = require('crypto');

const HASH_LENGTH = 16; // hex chars (64 bits)

/**
 * @param {string} input
 * @returns {string} First HASH_LENGTH hex chars of SHA-256
 */
function hashString(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex').slice(0, HASH_LENGTH);
}

/**
 * @param {*} value - JSON-serializable
 * @returns {string}
 */
function hashValue(value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return hashString(str);
}

module.exports = {
  hashString,
  hashValue,
  HASH_LENGTH,
};
