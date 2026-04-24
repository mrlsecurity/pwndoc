---
name: fork-sync-upstream
description: Use when upstream repo has new commits to pull into a fork, dev branch needs rebasing onto updated main, or syncing changed files to a remote dev server after merge.
---

# Fork Sync Upstream

Sync upstream → local main → fork → rebase dev → test → deploy.

## Steps

### 1. Preflight
```bash
git status  # must be clean — stash or commit first
git fetch origin && git fetch myfork
git log main..origin/main --oneline  # see what's new
```

### 2. Fast-forward local main
```bash
git checkout main
git merge --ff-only origin/main
```

### 3. Push main to fork
```bash
git push myfork main
```

### 4. Rebase dev onto main
```bash
git checkout dev
git rebase main
```

If conflicts: resolve manually, then:
```bash
git add <resolved-file>
git rebase --continue
```

**Conflict resolution rules:**
- Read BOTH sides fully before editing
- After resolving, `grep -n "<<<<<<\|=======\|>>>>>>>" <file>` — must return empty
- Keep upstream's structural guards (null checks, if-blocks) + dev's feature changes — they are usually complementary, not contradictory
- Watch indentation — mismatched braces cause `SyntaxError: Unexpected end of input`

### 5. Determine changed files
Note which files were involved in the upstream commits:
```bash
git diff --name-only <old-main-hash> origin/main
```
Split by path prefix: `backend/` → backend changed, `frontend/` → frontend changed.

### 6. Run tests (only relevant suite)
| Files changed | Command |
|---|---|
| `backend/` only | `./pwndoc-cli test --backend` |
| `frontend/` only | `./pwndoc-cli test --frontend-unit` |
| Both | `./pwndoc-cli test --backend --frontend-unit` |

**Do not deploy if tests fail.** Fix first.

### 7. Deploy to remote dev server
Single file:
```bash
rsync -avz local/path/to/file.js user@host:/opt/app/path/to/file.js
```

Multiple files — use `--files-from`:
```bash
cat > /tmp/sync-files.txt << 'EOF'
backend/src/lib/some-file.js
frontend/src/components/some-component.vue
EOF

rsync -avzn --files-from=/tmp/sync-files.txt ./  user@host:/opt/app/  # dry run first
rsync -avz  --files-from=/tmp/sync-files.txt ./  user@host:/opt/app/  # real sync
```

Dev mode (nodemon + Vite HMR): no container restart needed after sync.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Rebasing with dirty tree | `git stash` before rebase |
| Missing closing brace after conflict resolution | Count braces; run syntax check |
| Using `--files-from` for single file | Just pass file path directly |
| Deploying before tests pass | Tests first, always |
| Running all tests when only backend changed | Check file paths, run targeted suite |
