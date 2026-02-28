#!/usr/bin/env node
/**
 * Daily lessons aggregation: read lessons from mesh memory (lessons_by_role:*),
 * filter last 24 hours, write summary to mesh memory (lessons_daily:YYYY-MM-DD)
 * and optionally to a mesh skill (lessons-daily-YYYY-MM-DD).
 *
 * Run daily via cron. Requires MESH_STORE_DB_PATH.
 *
 *   MESH_STORE_DB_PATH=/path/to/mesh-store.sqlite node scripts/lessons-daily.js
 *
 * See OPENCLAW_ROLES_LEARNING_AND_SKILL_UPGRADE.md §5.2.
 */

const path = require('path');
const { openStore } = require(path.join(__dirname, '..', 'mesh', 'store', 'client.js'));

const DB_PATH = process.env.MESH_STORE_DB_PATH || null;
const WRITE_SKILL = process.env.LESSONS_DAILY_SKILL !== '0';

function run() {
  if (!DB_PATH) {
    console.error('Set MESH_STORE_DB_PATH');
    process.exit(1);
  }
  const store = openStore(DB_PATH);
  if (!store) {
    console.error('Store not available (better-sqlite3 required)');
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 24 * 3600;
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const lessons = [];
  try {
    const rows = store.listMemory('mesh');
    for (const row of rows) {
      if (!row.key || !row.key.startsWith('lessons_by_role:')) continue;
      const list = Array.isArray(row.value) ? row.value : [];
      for (const le of list) {
        if (le.ts >= dayAgo) lessons.push({ ...le, role: row.key.replace('lessons_by_role:', '') });
      }
    }
  } catch (e) {
    console.error('Error reading lessons:', e.message);
    process.exit(1);
  }

  lessons.sort((a, b) => a.ts - b.ts);

  const byRole = {};
  for (const le of lessons) {
    const r = le.role || 'unknown';
    if (!byRole[r]) byRole[r] = [];
    byRole[r].push(le.summary || le.error || le.outcome);
  }
  const lines = [];
  for (const [role, summaries] of Object.entries(byRole)) {
    const uniq = [...new Set(summaries)];
    lines.push('## ' + role + '\n' + uniq.map((s) => '- ' + s).join('\n'));
  }
  const summaryText = lines.length ? lines.join('\n\n') : 'No lessons in the last 24 hours.';

  const dailyPayload = { date: dateStr, summary: summaryText, count: lessons.length, lessons };
  try {
    store.putMemory('mesh', 'lessons_daily:' + dateStr, dailyPayload, 'army');
    console.error('Wrote mesh memory lessons_daily:' + dateStr);
  } catch (e) {
    console.error('Error writing lessons_daily:', e.message);
    process.exit(1);
  }

  if (WRITE_SKILL) {
    try {
      store.putSkill('lessons-daily-' + dateStr, 'army', summaryText, null);
      console.error('Wrote mesh skill lessons-daily-' + dateStr);
    } catch (e) {
      console.error('Error writing skill:', e.message);
    }
  }
}

run();
