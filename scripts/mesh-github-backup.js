#!/usr/bin/env node
/**
 * Export mesh store to JSON then git add / commit / push in a dedicated backup repo clone.
 *
 *   MESH_STORE_DB_PATH=/path/to/store.sqlite GITHUB_MESH_BACKUP_DIR=/path/to/backup-repo-clone node scripts/mesh-github-backup.js
 *
 * Env:
 *   MESH_STORE_DB_PATH — required (passed to mesh-git-export)
 *   GITHUB_MESH_BACKUP_DIR — git repo root; export writes here (required)
 *   MESH_GIT_EXPORT_SCOPES, MESH_GIT_EXPORT_KEY_PREFIX, MESH_GIT_EXPORT_SKILLS — same as mesh-git-export
 *   GITHUB_MESH_BACKUP_BRANCH — branch to commit/push (default: main)
 *   GITHUB_MESH_BACKUP_MESSAGE — commit message prefix (default: mesh memory backup)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { runExport } = require('./mesh-git-export.js');

function git(cwd, args) {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function runBackup() {
  const backupDir = process.env.GITHUB_MESH_BACKUP_DIR;
  if (!backupDir) {
    console.error('Set GITHUB_MESH_BACKUP_DIR to the path of your backup git repository');
    process.exit(1);
  }
  const resolved = path.resolve(backupDir);
  if (!fs.existsSync(path.join(resolved, '.git'))) {
    console.error(`Not a git repository (no .git): ${resolved}`);
    process.exit(1);
  }

  process.env.MESH_GIT_EXPORT_DIR = resolved;
  const exp = runExport({ exportDir: resolved });
  if (!exp) process.exit(1);

  const branch = process.env.GITHUB_MESH_BACKUP_BRANCH || 'main';
  const msgPrefix = process.env.GITHUB_MESH_BACKUP_MESSAGE || 'mesh memory backup';

  let g = git(resolved, ['rev-parse', '--verify', branch]);
  if (g.status !== 0) {
    g = git(resolved, ['checkout', '-b', branch]);
    if (g.status !== 0) {
      console.error('git checkout -b failed:', g.stderr);
      process.exit(1);
    }
  } else {
    g = git(resolved, ['checkout', branch]);
    if (g.status !== 0) {
      console.error('git checkout failed:', g.stderr);
      process.exit(1);
    }
  }

  g = git(resolved, ['add', '-A']);
  if (g.status !== 0) {
    console.error('git add failed:', g.stderr);
    process.exit(1);
  }

  g = git(resolved, ['diff', '--cached', '--quiet']);
  if (g.status === 0) {
    console.log('No changes to commit.');
    return;
  }

  const msg = `${msgPrefix} (${exp.memoryCount} memory, ${exp.skillCount} skills)`;
  g = git(resolved, ['commit', '-m', msg]);
  if (g.status !== 0) {
    console.error('git commit failed:', g.stderr);
    process.exit(1);
  }

  g = git(resolved, ['push', 'origin', branch]);
  if (g.status !== 0) {
    console.error('git push failed:', g.stderr);
    console.error('Configure SSH deploy key or HTTPS credential helper; see docs/GITHUB_MESH_MEMORY_BACKUP.md');
    process.exit(1);
  }
  console.log(`Pushed to ${branch}.`);
}

if (require.main === module) {
  runBackup();
}

module.exports = { runBackup };
