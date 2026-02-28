/**
 * Roles learning: write lessons to mesh memory when orders complete, fail, or are refused.
 * See OPENCLAW_ROLES_LEARNING_AND_SKILL_UPGRADE.md.
 * Used by the Army server after PATCH /army/orders/:id (report_up).
 */

const MAX_LESSONS_PER_KEY = 50;

/**
 * Append a lesson to a mesh memory key (array of lessons). Keeps last MAX_LESSONS_PER_KEY.
 * @param {object} store - Store with getMemory, putMemory
 * @param {string} scope - 'node' or 'mesh'
 * @param {string} key - e.g. '<nodeId>:lessons' or 'lessons_by_role:<role>'
 * @param {object} lesson - { orderId, nodeId, role, outcome, summary, ts, error? }
 * @param {string} nodeIdForWrite - node_id to store (e.g. order's target_node_id or 'army')
 */
function appendLessonToMemory(store, scope, key, lesson, nodeIdForWrite) {
  if (!store || typeof store.getMemory !== 'function' || typeof store.putMemory !== 'function') return;
  const existing = store.getMemory(scope, key);
  const list = Array.isArray(existing?.value) ? existing.value : [];
  list.push(lesson);
  const trimmed = list.slice(-MAX_LESSONS_PER_KEY);
  store.putMemory(scope, key, trimmed, nodeIdForWrite);
}

/**
 * Build a one-line summary from order outcome (result, error, status).
 * @param {object} order - { status, result, error, payload }
 * @returns {string}
 */
function buildLessonSummary(order) {
  const status = order.status || '';
  if (status === 'failed' && order.error) {
    return order.error.length > 200 ? order.error.slice(0, 197) + '...' : order.error;
  }
  if (status === 'refused' && order.error) {
    return 'Refused: ' + (order.error.length > 180 ? order.error.slice(0, 177) + '...' : order.error);
  }
  if (status === 'completed' && order.result) {
    const r = typeof order.result === 'string' ? order.result : JSON.stringify(order.result);
    return r.length > 200 ? r.slice(0, 197) + '...' : r;
  }
  return status === 'completed' ? 'Completed.' : status === 'failed' ? 'Failed.' : status === 'refused' ? 'Refused.' : status;
}

/**
 * Write a lesson to mesh memory (node and role keys) after an order is completed, failed, or refused.
 * Call this from the Army server after PATCH /army/orders/:orderId.
 * @param {object} store - Mesh store (openStore result) with getMemory, putMemory, getNode
 * @param {object} order - Updated order from getOrder: order_id, target_node_id, status, result, error, payload
 * @returns {void}
 */
function writeLesson(store, order) {
  if (!store || !order) return;
  const status = order.status || '';
  if (status !== 'completed' && status !== 'failed' && status !== 'refused') return;

  const nodeId = order.target_node_id || order.from_node || 'unknown';
  let role = 'unknown';
  if (order.target_node_id && store.getNode) {
    const node = store.getNode(order.target_node_id);
    if (node) {
      if (Array.isArray(node.skills) && node.skills.length > 0) role = node.skills[0];
      else if (node.rank) role = node.rank;
    }
  }

  const summary = buildLessonSummary(order);
  const ts = Math.floor(Date.now() / 1000);
  const lesson = {
    orderId: order.order_id,
    nodeId,
    role,
    outcome: status,
    summary,
    ts,
  };
  if (order.error) lesson.error = order.error;

  const writerNodeId = nodeId !== 'unknown' ? nodeId : 'army';
  appendLessonToMemory(store, 'node', nodeId + ':lessons', lesson, writerNodeId);
  appendLessonToMemory(store, 'mesh', 'lessons_by_role:' + role, lesson, writerNodeId);
}

module.exports = { writeLesson, buildLessonSummary, appendLessonToMemory, MAX_LESSONS_PER_KEY };
