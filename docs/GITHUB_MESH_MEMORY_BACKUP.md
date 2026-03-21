# GitHub (Git) backup and shared Army mesh memory

**Read-only from Git:** The canonical mesh store remains **SQLite** on the command host (same DB as the Army server). This flow **exports** snapshots to JSON, **commits and pushes** to a **private** Git repository (typically on GitHub), and lets **edge Army nodes** `git pull` and **import** into the local Phase 1 cache (`~/.openclaw`). Nothing in Git writes back into SQLite automatically.

## When to use it

- **Backup / audit trail:** Versioned snapshots of `mesh` scope memory (lessons, intel, etc.) and mesh skills.
- **Edge nodes without the DB:** Nodes that only run OpenClaw + bridge and do not host `mesh-store.sqlite` can still receive the same shared context after import.

## Architecture

1. **Command server** (NAS or host with `MESH_STORE_DB_PATH`): run export → commit → push on a schedule (e.g. cron).
2. **Private repo** holds `memory/`, `skills/`, and `manifest.json` at the repo root.
3. **Edge nodes:** `git pull` in a clone of that repo, then run the import script into `OPENCLAW_HOME`.

## Scripts

| Script | Role |
|--------|------|
| [`scripts/mesh-git-export.js`](../scripts/mesh-git-export.js) | SQLite → `memory/`, `skills/`, `manifest.json` under `MESH_GIT_EXPORT_DIR`. |
| [`scripts/mesh-github-backup.js`](../scripts/mesh-github-backup.js) | Runs export into `GITHUB_MESH_BACKUP_DIR`, then `git add`, `commit`, `push`. |
| [`scripts/mesh-git-import.js`](../scripts/mesh-git-import.js) | Reads a clone directory into local cache; LWW for memory by `updated_at`; skills tracked via `mesh-skills-import-state.json`. |

From repo root (requires `better-sqlite3` for export):

```bash
npm run run:mesh-git-export
npm run run:mesh-github-backup
npm run run:mesh-git-import
```

## Environment variables

### Export (`mesh-git-export.js`)

| Variable | Description |
|----------|-------------|
| `MESH_STORE_DB_PATH` | Path to SQLite store (**required**). |
| `MESH_GIT_EXPORT_DIR` | Output directory (default: `./mesh-git-export`). |
| `MESH_GIT_EXPORT_SCOPES` | Comma-separated scopes, or `all` (default: `mesh`). |
| `MESH_GIT_EXPORT_KEY_PREFIX` | Optional comma-separated key prefixes; if set, only keys starting with one are exported. |
| `MESH_GIT_EXPORT_SKILLS` | Set to `0` to skip skills (default: export skills with inline `content`). |

### Backup + push (`mesh-github-backup.js`)

| Variable | Description |
|----------|-------------|
| `MESH_STORE_DB_PATH` | Same as export. |
| `GITHUB_MESH_BACKUP_DIR` | Path to a **git clone** of the private backup repo (**required**). Export writes directly here. |
| `GITHUB_MESH_BACKUP_BRANCH` | Branch to commit and push (default: `main`). |
| `GITHUB_MESH_BACKUP_MESSAGE` | Commit message prefix (default: `mesh memory backup`). |

Also passes through the `MESH_GIT_EXPORT_*` variables above.

**Authentication:** Use SSH (deploy key on the NAS) or HTTPS with a credential helper / token in the environment—**never** commit tokens into the export tree.

### Import (`mesh-git-import.js`)

| Variable | Description |
|----------|-------------|
| `MESH_GIT_IMPORT_DIR` | Root of a clone containing `memory/` and `skills/` (**required**). |
| `OPENCLAW_HOME` | OpenClaw directory (default: `~/.openclaw`). |

**Memory:** If the cache already has `scope:key` with `ts` ≥ imported `updated_at`, the entry is skipped.

**Skills:** Last imported `updated_at` per skill name is stored in `OPENCLAW_HOME/mesh-skills-import-state.json` so LWW does not depend on file mtimes.

## Layout of an export

```
manifest.json
memory/
  <scope>/
    <sanitized-key>.json   # { scope, key, value, node_id, updated_at }
skills/
  <sanitized-name>.json    # { name, source_node, content, updated_at }
```

## Security

- Use a **private** repository; treat exports as **operational data** (lessons, intel, procedures).
- Do **not** store API keys, session tokens, or passwords in mesh memory if those rows are exported—**redact** or narrow `MESH_GIT_EXPORT_KEY_PREFIX` to exclude sensitive keys.

## Cron examples

**Command host — hourly backup push:**

```bash
0 * * * * cd /path/to/Raise-The-OpenClaw && MESH_STORE_DB_PATH=/data/mesh-store.sqlite GITHUB_MESH_BACKUP_DIR=/data/mesh-memory-git /usr/bin/node scripts/mesh-github-backup.js >> /var/log/mesh-git-backup.log 2>&1
```

**Edge node — daily pull + import:**

```bash
15 6 * * * cd /path/to/mesh-memory-git && git pull --ff-only && MESH_GIT_IMPORT_DIR=/path/to/mesh-memory-git OPENCLAW_HOME=/home/agent/.openclaw /usr/bin/node /path/to/Raise-The-OpenClaw/scripts/mesh-git-import.js >> /var/log/mesh-git-import.log 2>&1
```

## GitHub Actions

Running export in CI only works if the runner can reach your SQLite file (unusual for home/NAS setups). Prefer **scheduled jobs on the machine that already holds `MESH_STORE_DB_PATH`**.

## See also

- [army/README.md](../army/README.md) — Army memory keys and search.
- [mesh/store/README.md](../mesh/store/README.md) — Shared store.
- [docs/RUNBOOKS.md](RUNBOOKS.md) — Configure backup and edge import.
