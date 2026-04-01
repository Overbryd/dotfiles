# wsync: final architecture and implementation checklist

## Final conclusion

The best `wsync` is a **hybrid**:

- **workspace profiles** for multi-root workspaces like `hibase_umbrella`
- **path-driven auto-detection** for `wsync`, `wsync ~/Projects`, `wsync ~/Work`, `wsync ~/`
- **no configured root modes**; modes are inferred from the filesystem
- **three-layer Git handling**:
  - Git refs/objects sync
  - repo-overlay file sync
  - guided worktree reconciliation
- **plan-first for every command**, then apply only on exact `yes`

The key safety rule is:

> `wsync` may inspect both machines, sync Git history both ways, and sync local-only files, but it must never change a worktree implicitly.

Any worktree change must be deliberate, reviewed, and applied only on the **current machine** through a guided flow.

## Final behavior

### 1. Target resolution

`wsync` should accept:

- `wsync` → inspect `pwd`
- `wsync <path>` → inspect that path
- `wsync <profile>` → expand configured profile roots
- `wsync pull [target]`
- `wsync push [target]`
- `wsync doctor`

No `plan` subcommand. Every sync command generates a plan first.

### 2. Auto-detected sync modes

For every selected root/path, infer the handling mode:

- **inside a Git repo** → resolve to the Git root and treat it as a **git workspace**
- **plain directory with no Git roots inside** → treat as a **plain-dir**
- **plain directory containing nested Git roots** → treat as a **mixed tree** and recursively partition it into:
  - Git workspace chunks
  - plain-dir chunks between them

### 3. Git workspace behavior

When the selected path is inside a Git repo, `wsync` must always do three things:

1. **Synchronize Git repository data both ways first**
   - use `git fetch` locally from the peer repo
   - use `ssh` to run `git fetch` remotely from the current repo
   - sync branches, tags, and object data
   - **never** update either worktree during this phase
   - **never** push into the peer worktree directly

2. **Build a dry-run repo-overlay file sync plan**
   - sync only:
     - untracked, non-ignored files
     - explicitly configured local-only include patterns
   - never sync Git-tracked files via rsync
   - never auto-follow symlink targets like `.peek/`
   - copy symlinks as symlinks only

3. **Run a guided worktree reconciliation step**
   - inspect both local and peer worktrees
   - compare:
     - current branch or detached HEAD
     - HEAD commit
     - upstream branch
     - ahead/behind state
     - tracked-file dirtiness summary
     - untracked-file summary
   - classify the situation, for example:
     - same branch, same commit
     - same branch, fast-forward available
     - same branch, diverged
     - different branches checked out
     - local dirty
     - peer dirty
     - detached HEAD
   - present the differences clearly in the plan and at apply time
   - allow only safe, explicit actions on the **current machine**
   - never auto-change the peer worktree

### 4. Guided worktree actions

The guided worktree step should be intentionally conservative.

Safe automated actions for v1:

- **skip**
- **show guidance only**
- **fast-forward current branch** when the current worktree is clean and fast-forward is possible
- **switch current machine to the peer branch** when the current worktree is clean and the branch exists locally or can be created from fetched refs

Manual-only in v1:

- merge
- rebase
- stash/pop
- reset
- conflict resolution
- changing the peer worktree

This keeps the tool safe while still making the worktree state obvious and actionable.

### 5. Plain-dir behavior

For non-Git directories:

- use `rsync` dry-run first
- recurse into the tree
- when nested Git roots are found:
  - emit separate Git workspace chunks for them
  - exclude them from the parent plain-dir chunk
- apply common excludes and ecosystem excludes
- no delete by default

### 6. Profiles

Profiles stay, but they only define:

- workspace name
- list of root paths
- optional extra include/exclude rules per path

Profiles **do not** define modes. Modes are inferred.

This preserves the good architecture for cases like:

- `~/Work/hibase/bi-hero-x/hibase_umbrella`
- related repos in `~/Projects/Elixir/...`
- secret directories elsewhere

### 7. Planning UX

Every sync command should:

1. discover/expand target
2. generate chunked plan
3. write full plan to a state file like:
   - `~/.local/state/wsync/runs/<timestamp>/plan.txt`
4. show a concise summary in terminal
5. if interactive and the plan is large, open the plan in `$EDITOR`
6. allow removing whole chunks from the plan file before apply
7. apply only the remaining chunks after the user types `yes`

Plan chunks should be:

- grouped by root/repo/folder
- sorted predictably
- separated by **two blank lines**
- easy to delete as blocks in Vim

For Git repos, the plan should have separate chunks for:

- `git-sync`
- `repo-overlay`
- `worktree-review`

`worktree-review` chunks should include:

- local vs peer branch/commit summary
- dirty/clean indicators
- the recommended next action
- whether the chunk is applyable automatically or guidance-only

### 8. Safety rules

- no delete by default
- no implicit worktree updates
- no automatic worktree changes on the peer machine
- no rsync of Git-tracked files
- no automatic traversal of symlink targets
- only portable rsync flags
- lock file per run
- log file per run

---

## Implementation checklist

## Phase 0 — foundation

- [ ] Add reciprocal SSH host aliases for both machines in `~/.ssh/config`
- [ ] Use `/usr/bin/python3` for the new `.bin/wsync` implementation
- [ ] Keep the implementation nearly dependency-free
- [ ] Prefer TOML config for readability
- [ ] Use stdlib `tomllib` when available, with vendored `tomli` fallback for Python 3.9
- [ ] Avoid pip-installed dependencies
- [ ] Create state dirs:
  - [ ] `~/.local/state/wsync/runs`
  - [ ] `~/.local/state/wsync/logs`
  - [ ] `~/.local/state/wsync/locks`
- [ ] Define config location:
  - [ ] `~/.config/wsync/config.toml`
  - [ ] `~/.config/wsync/profiles/*.toml`
- [ ] Move rsync binary selection to explicit candidate resolution:
  - [ ] `$WSYNC_RSYNC`
  - [ ] `/opt/homebrew/bin/rsync`
  - [ ] `/usr/local/bin/rsync`
  - [ ] `/usr/bin/rsync`

## Phase 1 — CLI and target resolution

- [ ] Replace `.bin/wsync` with a small Python CLI entrypoint
- [ ] Support commands:
  - [ ] `wsync`
  - [ ] `wsync <path>`
  - [ ] `wsync <profile>`
  - [ ] `wsync pull [target]`
  - [ ] `wsync push [target]`
  - [ ] `wsync doctor`
- [ ] Default direction for bare `wsync` is `pull`
- [ ] Resolve bare `wsync` target from `pwd`
- [ ] If `pwd` is inside a Git repo, resolve to the Git root
- [ ] If argument is a path, expand `~` and resolve absolute path
- [ ] If argument is not a path, try resolving it as a profile name

## Phase 2 — filesystem detection and chunking

- [ ] Implement Git root detection for any path
- [ ] Implement recursive scanner for selected roots
- [ ] Partition scanned trees into chunk types:
  - [ ] `git-sync` chunk
  - [ ] `repo-overlay` chunk
  - [ ] `worktree-review` chunk
  - [ ] `plain-dir` chunk
- [ ] When nested Git roots are found, exclude them from parent plain-dir chunks
- [ ] Do not follow symlink targets during scanning
- [ ] Preserve symlinks as symlinks in planned file syncs
- [ ] Add large-tree guards for `~/`, `~/Work`, `~/Projects`

## Phase 3 — Git synchronization

- [ ] For each Git chunk, resolve the peer repo path using the same absolute path on the peer
- [ ] Implement local fetch from peer repo over SSH
- [ ] Implement remote fetch from current repo over SSH
- [ ] Fetch branches and tags only; do not checkout, merge, rebase, or reset
- [ ] Never push directly into the peer working tree
- [ ] Skip Git chunk cleanly if the peer path is missing or not a repo
- [ ] Report Git chunk status clearly in the plan

## Phase 4 — repo overlay sync

- [ ] Build repo-overlay candidate file set from:
  - [ ] `git ls-files --others --exclude-standard`
  - [ ] configured local-only include patterns
- [ ] Exclude Git-tracked files from overlay sync unconditionally
- [ ] Apply common excludes and ecosystem excludes to overlay sync
- [ ] Include `.peek/` as data only when matched by includes or discovered as local files
- [ ] Do not auto-follow `.peek` symlink targets
- [ ] Generate rsync dry-run for the overlay chunk

## Phase 5 — guided worktree reconciliation

- [ ] Collect local worktree snapshot:
  - [ ] branch or detached HEAD
  - [ ] HEAD commit
  - [ ] upstream branch
  - [ ] ahead/behind counts
  - [ ] tracked-file dirty summary
  - [ ] untracked-file summary
- [ ] Collect the same snapshot from the peer repo over SSH
- [ ] Compare local and peer worktree state
- [ ] Classify the scenario:
  - [ ] same branch, same commit
  - [ ] same branch, fast-forward possible
  - [ ] same branch, diverged
  - [ ] different branches
  - [ ] local dirty
  - [ ] peer dirty
  - [ ] detached HEAD
- [ ] Render a `worktree-review` chunk into the plan
- [ ] Mark each worktree chunk as either:
  - [ ] applyable automatically
  - [ ] guidance-only
- [ ] Implement guided choices for the current machine only:
  - [ ] skip
  - [ ] show suggested commands
  - [ ] fast-forward current branch when safe
  - [ ] switch current machine to peer branch when safe
- [ ] Refuse to automate merge/rebase/reset/stash in v1
- [ ] Never auto-change the peer worktree

## Phase 6 — plain-dir sync

- [ ] Implement plain-dir rsync planner for non-Git spans
- [ ] Apply common excludes
- [ ] Apply ecosystem excludes
- [ ] Use a portable rsync flag subset only
- [ ] Disable delete by default
- [ ] Generate itemized dry-run output per plain-dir chunk

## Phase 7 — plan file UX

- [ ] Write every plan to `~/.local/state/wsync/runs/<timestamp>/plan.txt`
- [ ] Format plan as stable chunk blocks with machine-readable headers
- [ ] Separate chunks by two blank lines
- [ ] Include chunk id, type, path, direction, and summary counts
- [ ] Include recommendation lines for worktree-review chunks
- [ ] Parse edited plan file and apply only remaining chunks
- [ ] If interactive and plan exceeds a threshold, open it in `$EDITOR`
- [ ] Otherwise print summary + plan path + confirmation prompt
- [ ] Require exact `yes` to apply

## Phase 8 — config and profiles

- [ ] Implement profile config with:
  - [ ] profile name
  - [ ] list of root paths
  - [ ] per-path extra local include patterns
  - [ ] per-path extra excludes
- [ ] Do **not** implement configured root modes
- [ ] Add initial profiles:
  - [ ] `hibase-umbrella`
  - [ ] `shared-secrets`
  - [ ] one smaller sandbox profile
- [ ] Add ecosystem exclude presets:
  - [ ] common
  - [ ] elixir
  - [ ] node
  - [ ] python
  - [ ] terraform

## Phase 9 — doctor and safety checks

- [ ] Implement `wsync doctor`
- [ ] Check current host mapping and peer host mapping
- [ ] Check reciprocal SSH connectivity
- [ ] Check local and remote `/usr/bin/python3` availability
- [ ] Check local TOML parser availability (`tomllib` or vendored `tomli`)
- [ ] Check local and remote rsync resolution
- [ ] Report selected rsync compatibility mode
- [ ] Check Git availability locally and remotely
- [ ] Check config validity
- [ ] Check state dir writability

## Phase 10 — rollout tests

- [ ] Test `wsync` inside a Git repo
- [ ] Confirm it resolves to the Git root automatically
- [ ] Confirm Git refs sync both ways without worktree updates
- [ ] Confirm tracked files are never rsynced
- [ ] Confirm repo overlay plan shows only local files
- [ ] Confirm worktree-review shows local vs peer branch/commit state clearly
- [ ] Confirm safe worktree actions only affect the current machine
- [ ] Confirm dirty or divergent repos become guidance-only
- [ ] Test `wsync ~/Projects`
- [ ] Confirm nested repos become separate chunks
- [ ] Test `wsync ~/Work`
- [ ] Confirm plan chunking is readable and editable
- [ ] Test `wsync hibase-umbrella`
- [ ] Confirm profile expansion across `~/Work`, `~/Projects`, and secrets works
- [ ] Test with Apple rsync on one side and Homebrew rsync on the other

---

## MVP cutoff

The MVP is complete when all of these are true:

- [ ] `wsync` works with no arguments from inside a Git repo
- [ ] `wsync <path>` works for mixed trees like `~/Projects`
- [ ] `wsync <profile>` works for multi-root workspaces
- [ ] every sync command is plan-first and confirm-to-apply
- [ ] Git refs sync both ways without touching either worktree
- [ ] repo overlays sync only local/untracked/configured files
- [ ] worktree-review clearly explains local vs peer worktree differences
- [ ] only safe current-machine worktree actions are automated
- [ ] plain-dir sync skips nested Git repos correctly
- [ ] `doctor` verifies SSH, Git, and rsync portability

## Explicitly later

- [ ] conflict detection based on previous runs
- [ ] delete/mirror mode
- [ ] automatic `.peek` dependency discovery into profiles
- [ ] richer TUI/pager workflow
- [ ] automated merge/rebase/stash assistance beyond guidance
