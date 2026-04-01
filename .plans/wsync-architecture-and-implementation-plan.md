# wsync: architecture and implementation plan

## 1. Problem statement

Your current `.bin/wsync` solves a real problem very well in spirit:

- same username on both machines
- same folder structure
- fast manual pull from the other machine into the current one
- built on boring, reliable infrastructure (`ssh` + `rsync`)

But it is now too small for the shape of your work:

- it assumes a single current directory sync
- it has hardcoded peer IPs
- it relies on whatever `rsync` is first in `PATH`
- it uses flags that are not portable across Apple/openrsync/Homebrew rsync builds
- it only knows simple excludes
- it has no concept of a workspace spanning multiple roots (`~/Work`, `~/Projects`, secrets, auxiliary repos)
- it has no safety model for Git working trees
- it has no preview/plan mode, conflict story, or audit trail

The key shift is this:

> `wsync` should stop thinking in terms of “sync the current directory” and start thinking in terms of “sync an explicit workspace profile”.

That is the clean way to handle cases like:

- `~/Work/hibase/bi-hero-x/hibase_umbrella`
- plus related paths in `~/Projects/Elixir/...`
- plus selected local-only files
- plus secret material
- while still avoiding caches, build outputs, and dangerous overwrites

---

## 2. Desired properties

The new `wsync` should be:

- **simple**: no server, no daemon, no cloud dependency
- **predictable**: explicit direction and explicit path set
- **safe**: avoid clobbering active Git working trees
- **portable**: tolerate Apple/openrsync/Homebrew rsync differences
- **workspace-aware**: support one logical project spanning multiple directories
- **boring**: built on `ssh`, `rsync`, `git`, and local config files
- **inspectable**: dry-run first, clear output, logs, and no hidden magic

Non-goal:

- fully automatic, magical, always-on bi-directional sync of arbitrary working directories

That is where surprises begin.

---

## 3. Recommendation in one sentence

**Recommended direction:** build a **manifest-driven, directional, Git-aware `wsync`** on top of `ssh` + a **portable rsync flag subset**, where you sync **named workspace profiles** instead of just `$(pwd)`.

This keeps the good part of the current tool, but adds:

- profiles
- dependency roots
- repo-local safe includes
- dry-run and confirmation
- Git guards
- explicit peer resolution
- version checks / doctor mode

---

## 4. Current script assessment

Current `.bin/wsync`:

```bash
#!/usr/bin/env bash

if [[ "$(hostname)" == "mba1" ]]; then
  from="10.10.10.4"
elif [[ "$(hostname)" == "ms1" ]]; then
  from="10.10.10.5"
else
  die "Unknown host: $(hostname)"
fi

rsync \
  --archive \
  --verbose \
  --checksum \
  --compress \
  --cache \
  --timeout=120 \
  --partial-dir=/tmp/rsync-$(date +%Y-%m-%d) \
  --progress \
  --exclude='.terraform/' \
  --exclude='.direnv/' \
  --exclude='__pycache__/' \
  --exclude='_build/' \
  $from:"$(pwd)"/ "$(pwd)"/
```

### What is good

- short
- obvious
- easy to run from muscle memory
- fits your “pull from other machine to current machine” workflow

### What breaks now

1. **Rsync portability**
   - `--cache` is not portable across rsync variants.
   - relying on `rsync` from `PATH` is fragile.

2. **Transport identity**
   - hardcoded IPs are brittle
   - host aliases in `~/.ssh/config` are cleaner

3. **Sync scope**
   - `$(pwd)` only
   - no support for related roots in `~/Projects`, secrets, or shared local state

4. **Safety**
   - no dry-run first
   - no Git dirtiness checks
   - no conflict handling strategy
   - no delete policy model

5. **No workspace graph**
   - `.peek/` can point to meaningful dependencies outside the current tree
   - current tool has no concept of “this project depends on these other local roots”

---

## 5. Multi-angle analysis

## Angle A: Keep a tiny current-directory rsync script

### Pros
- minimal
- easy to reason about
- no new config model

### Cons
- does not solve cross-root workspaces
- unsafe for complex repos
- difficult to express Git-safe local-only files
- does not address `.peek` dependency graphs

### Verdict
Good as history, no longer sufficient.

---

## Angle B: Mirror all of `~/Work` and `~/Projects`

### Pros
- simple mental model
- both machines “evolve together”

### Cons
- too much surface area
- risky for active Git working trees
- expensive and noisy
- easy to drag caches/build outputs
- dangerous deletes if mirroring strictly

### Verdict
Tempting, but too blunt as a default.

---

## Angle C: Use a true bi-directional sync tool (Unison / Syncthing)

### Pros
- built for two-way reconciliation
- conflict handling already exists
- less custom code

### Cons
- more moving parts
- less aligned with your current explicit workflow
- not ideal for active Git working directories
- another dependency to maintain

### Verdict
Worth knowing about, but not the best primary tool here.

**Where it could help:** non-repo personal data, notes, or continuously-changing plain directories.

---

## Angle D: Git for code, `wsync` only for local state and secrets

### Pros
- very safe
- clean separation of concerns
- avoids touching tracked files

### Cons
- requires explicit manifests for local-only files
- some setup effort per project

### Verdict
This is the strongest foundation.

---

## Angle E: Manifest-driven workspace sync over ssh/rsync

### Pros
- explicit and predictable
- supports multiple roots per logical workspace
- can be made Git-aware
- reuses your existing habits and infrastructure
- easy to dry-run

### Cons
- requires a small config model
- requires a smarter implementation than the current Bash snippet

### Verdict
**Best fit.**

---

## 6. Final architecture

## 6.1 Core idea

A `wsync` invocation should target a **profile**, not just the current directory.

Examples:

- `wsync plan hibase-umbrella`
- `wsync pull hibase-umbrella`
- `wsync push hibase-umbrella`
- `wsync doctor`

A profile is a named workspace composed of one or more **roots**.

Example profile conceptually:

- `~/Work/hibase/bi-hero-x/hibase_umbrella`
- `~/Projects/Elixir/foo`
- `~/Projects/Elixir/bar`
- `~/.secrets/hibase`

Each root has a **mode** that determines how it is handled.

---

## 6.2 Root modes

### 1. `repo-local`
For directories that are Git repos, but where `wsync` should only sync explicit local-only files.

Use this for:

- `.envrc.local`
- `.tool-versions.local`
- `.secrets/`
- `.peek/`
- editor / agent / local config
- hand-maintained auxiliary files not tracked in Git

This mode should **not** sync the whole repo by default.

Instead, it syncs only explicit include patterns.

This is the main protection against accidentally overwriting a Git working tree.

### 2. `plain-dir`
For non-repo directories where syncing the whole directory is acceptable.

Use this for:

- dedicated secrets directories
- standalone notes folders
- plain local data not managed by Git

### 3. `link-discovery` (read-only helper mode)
For directories like `.peek/` that contain symlinks or references to external projects.

This mode should **discover** candidate dependency roots, but not auto-follow them implicitly.

Instead, it can suggest additions to the profile.

---

## 6.3 Why `.peek/` should not be followed automatically

A symlink tree can unexpectedly pull in:

- huge codebases
- private keys
- caches
- unrelated directories
- nested symlink loops

So the rule should be:

> `.peek/` may be scanned for suggestions, but its targets only become sync roots after you explicitly declare them in the profile.`

That preserves clarity and avoids “why did wsync touch that?” moments.

---

## 6.4 Profiles as workspace graphs

Profiles should support:

- explicit roots
- reusable presets
- inclusion of other profiles

Example concept:

- `core-work`
- `elixir-shared`
- `hibase-umbrella`

Where `hibase-umbrella` can include `elixir-shared`.

This is the clean way to make `~/Work` and `~/Projects` evolve together **where they actually belong together**, without making both top-level trees a dangerous blanket mirror.

---

## 7. Config model

## 7.1 Recommended config location

Use a central config in dotfiles, for example:

- `~/.config/wsync/config.toml`
- `~/.config/wsync/profiles/*.toml`

Since this is your personal machine-to-machine tool, central config is cleaner than scattering manifests into repos.

Later, if useful, `wsync` can also support optional repo-local manifests.

---

## 7.2 Example config shape

Use TOML rather than JSON or YAML.

Why TOML is the best fit here:

- more readable than JSON
- much simpler and safer than YAML
- good match for nested but still human-edited config
- can be parsed with stdlib `tomllib` on newer Python, with a tiny vendored `tomli` fallback on Python 3.9

`~/.config/wsync/config.toml`

```toml
version = 1

[machines.mba1]
peer = "ms1"
ssh_host = "ms1"

[machines.ms1]
peer = "mba1"
ssh_host = "mba1"

[defaults]
delete = false
dry_run = true
rsync_candidates = [
  "/opt/homebrew/bin/rsync",
  "/usr/local/bin/rsync",
  "/usr/bin/rsync",
]

[defaults.excludes]
common = [
  ".DS_Store",
  ".direnv/",
  ".terraform/",
  "__pycache__/",
  ".cache/",
]

[presets.elixir]
excludes = ["_build/", "deps/", ".elixir_ls/"]

[presets.node]
excludes = ["node_modules/", "dist/", ".next/"]

[presets.python]
excludes = [".venv/", "venv/", "__pycache__/"]
```

`~/.config/wsync/profiles/hibase-umbrella.toml`

```toml
name = "hibase-umbrella"

[[roots]]
path = "~/Work/hibase/bi-hero-x/hibase_umbrella"
presets = ["elixir"]
includes = [".peek/***", ".envrc.local", ".secrets/***", ".ai/***"]

[[roots]]
path = "~/Projects/Elixir/shared_lib_a"
presets = ["elixir"]
includes = [".envrc.local", ".secrets/***"]

[[roots]]
path = "~/Projects/Elixir/shared_lib_b"
presets = ["elixir"]
includes = [".envrc.local"]

[[roots]]
path = "~/.secrets/hibase"
```

Notes:

- roots only describe paths plus optional include/exclude hints
- sync mode is inferred at runtime from the filesystem
- presets are only exclude bundles, not implicit include rules
- no pip-installed parser should be required; vendor `tomli` if running on Python versions without `tomllib`

---

## 7.3 SSH identity

Replace hardcoded IP logic with `~/.ssh/config` aliases:

```sshconfig
Host mba1
  HostName 10.10.10.4
  User garmisch

Host ms1
  HostName 10.10.10.5
  User garmisch
```

Then `wsync` only needs to know:

- current hostname
- peer alias

This is more stable than embedding addresses in the script.

---

## 8. Command design

## 8.1 Minimum command set

### `wsync doctor`
Checks:

- current host recognized
- peer reachable over SSH
- local/remote rsync path resolution
- supported rsync flags
- config validity
- Git availability

### `wsync plan <profile>`
Dry-run only.

Shows:

- which roots will be touched
- direction
- resolved excludes/includes
- missing paths
- Git safety warnings
- itemized rsync changes

### `wsync pull <profile>`
Sync from peer to current machine.

### `wsync push <profile>`
Sync from current machine to peer.

### `wsync discover <path-to-.peek>`
Scans `.peek/` symlinks and prints suggested profile roots.

This should not modify config automatically in v1.

---

## 8.2 Optional later commands

- `wsync status <profile>`
- `wsync logs`
- `wsync prune <profile>` for explicitly confirmed delete mirroring
- `wsync edit-config <profile>`

---

## 9. Safety model

This is the most important part.

## 9.1 Direction must be explicit

Default behavior should remain aligned with your habit:

- `pull` from the other machine into the current one

But it should always be explicit in output:

- source host
- destination host
- profile name
- roots involved

---

## 9.2 Dry-run first

`plan` should be the normal first step.

In practice, `pull` and `push` can internally do:

1. validate
2. generate plan
3. show summary
4. ask for confirmation unless `--yes`
5. apply

---

## 9.3 No delete by default

Deletion should be **off by default**.

That means:

- pulling in new/changed files is normal
- removing files on the destination should require an explicit mode

Recommended future policy:

- default: `delete: false`
- optional per-root mode later: `delete: mirror`

This avoids surprise data loss.

---

## 9.4 Git safety guard

For any root inside a Git repo:

### default rule
- do **not** sync the whole repo
- sync only explicitly declared local-only include paths

### extra guard
Before applying changes, `wsync` should check:

- is the repo dirty?
- do proposed changes intersect tracked files?

If yes:

- abort by default
- require an explicit override to proceed

This is the main answer to:

> “I do not want implicit negative consequences, like overwriting a current git working directory.”

---

## 9.5 No automatic symlink target traversal

- copy symlinks as symlinks when syncing `.peek/`
- do not automatically sync symlink targets
- use `discover` to turn targets into explicit roots

---

## 9.6 Locks and logs

Use local state directory, e.g.:

- `~/.local/state/wsync/locks/`
- `~/.local/state/wsync/logs/`
- `~/.local/state/wsync/runs/`

Benefits:

- prevent concurrent runs
- keep a simple audit trail
- easier debugging when something feels off

---

## 10. Rsync portability strategy

This is necessary because your current pain is exactly here.

## 10.1 Do not depend on a random `rsync` in `PATH`

`wsync` should resolve binaries explicitly from a candidate list, e.g.:

1. `$WSYNC_RSYNC`
2. `/opt/homebrew/bin/rsync`
3. `/usr/local/bin/rsync`
4. `/usr/bin/rsync`

And do the same remotely over SSH.

---

## 10.2 Use a portable flag subset in v1

Avoid variant-specific flags like `--cache`.

Start with a conservative common subset, for example:

- `-a`
- `-v`
- `-z` (optional)
- `--partial`
- `--timeout=120`
- `--checksum` only when explicitly requested or for sensitive cases
- `--exclude-from <tmpfile>`
- `--include-from <tmpfile>` where needed
- `--rsync-path=<resolved remote path>`

Do **not** optimize too early around exotic rsync features.

The first job is correctness and portability.

---

## 10.3 `doctor` should report compatibility mode

Example output conceptually:

- local rsync: `/usr/bin/rsync` (compatible mode)
- remote rsync: `/opt/homebrew/bin/rsync` (modern mode)
- selected mode: `portable`

If both sides have a modern rsync, later you can opt into a richer mode.

---

## 11. How the workspace model solves your actual problem

Your example:

- main project in `~/Work/.../hibase_umbrella`
- `.peek/` points at related projects in `~/Projects/Elixir/...`

Under this plan:

1. `hibase_umbrella` becomes a named profile.
2. The umbrella repo is added as a `repo-local` root.
3. `.peek/` is synced as local workspace metadata.
4. `wsync discover ~/Work/.../hibase_umbrella/.peek` suggests external paths.
5. The relevant `~/Projects/...` directories are added as explicit roots.
6. Each related repo declares only the local-only files that `wsync` may touch.

Result:

- your logical workspace moves together
- unrelated repos remain untouched
- Git-tracked source is still handled by Git
- local state and secrets move with you
- `.peek` can remain part of the workflow without becoming a dangerous implicit traversal mechanism

---

## 12. Recommended implementation approach

## 12.1 Language choice

### Recommendation: implement `wsync` as a small Python CLI

Why Python is a good fit here:

- `/usr/bin/python3` is available on this machine and is commonly available on macOS
- the Python standard library covers most of the tool
- `argparse`, `pathlib`, `subprocess`, `tempfile`, and `shlex` cover the core needs
- TOML config is readable and can use stdlib `tomllib` when available
- for Python 3.9, a tiny vendored `tomli` fallback keeps the tool nearly dependency-free
- easier to read and maintain than a larger Bash script

Keep the entrypoint at `.bin/wsync`, but let it be a Python script using `#!/usr/bin/python3`.

### Why not keep growing Bash

Bash is fine for the current 15-line helper, but brittle for:

- profile graphs
- config parsing
- Git safety checks
- temp include/exclude files
- logs / state
- clean error handling

If you strongly prefer Bash, it is possible, but the complexity ceiling is lower.

---

## 12.2 Internal modules / responsibilities

### `Config`
- load TOML via `tomllib` or vendored `tomli`
- resolve profile files and defaults
- expand `~`
- validate roots and runtime-detectable settings

### `Machine`
- detect current host
- resolve peer alias
- resolve SSH target

### `RsyncResolver`
- detect local and remote rsync binary
- determine portable/modern mode

### `GitGuard`
- detect whether a root is inside a repo
- detect dirty state
- detect whether proposed changes would touch tracked files

### `Planner`
- expand roots into concrete rsync operations
- build include/exclude temp files
- generate dry-run output

### `Executor`
- run rsync operations in order
- write logs
- enforce locks

### `Discover`
- scan `.peek/` symlinks
- print candidate dependency roots

---

## 12.3 Execution model per root

### For `repo-local`

1. locate repo root
2. validate include patterns exist or report missing
3. generate rsync include list
4. exclude everything else
5. dry-run
6. Git guard checks
7. apply if confirmed

This is the safest and most important mechanism.

### For `plain-dir`

1. apply global + preset excludes
2. dry-run
3. apply if confirmed

---

## 13. Phased implementation plan

## Phase 0: Planning and inventory

### Tasks
- inventory current sync use cases
- list the top 5 real workspace profiles you actually switch between
- list common local-only file types you want synced
- list exclusions by ecosystem
- list secrets roots that should be included
- add/clean up SSH host aliases for both machines

### Deliverable
- initial `wsync` config draft with 2–3 real profiles

---

## Phase 1: Safe MVP

### Goal
Replace current one-dir sync with profile-based directional sync that is safe and predictable.

### Features
- `doctor`
- `plan <profile>`
- `pull <profile>`
- `push <profile>`
- host/peer detection
- rsync binary resolution
- portable rsync flags only
- `repo-local` mode
- `plain-dir` mode
- global and preset excludes
- dry-run + confirmation
- no delete
- local lock + log files

### Explicit non-features for MVP
- automatic conflict detection across both sides
- automatic profile editing
- auto-following `.peek` targets
- delete mirroring

### Deliverable
A new `.bin/wsync` that is good enough for daily use.

---

## Phase 2: Workspace discovery and ergonomics

### Features
- `discover <path-to-.peek>`
- profile composition (`include_profile` / reusable root groups)
- prettier summaries
- `status <profile>`
- per-root required/optional flags
- better missing-path reporting

### Deliverable
Faster setup for complex workspaces like `hibase_umbrella`.

---

## Phase 3: Stronger safety / conflict awareness

### Features
- record last successful sync state per profile
- detect “changed on both sides since last sync” for non-Git files
- refuse to overwrite such files automatically
- optional stash/copy-as-conflict behavior

### Deliverable
Higher confidence when both machines have drifted.

---

## Phase 4: Optional advanced features

### Candidates
- explicit `mirror` mode with delete
- encrypted export/import for selected secret roots
- TUI summary mode
- watch mode for a single plain-dir profile

These are optional, not required for success.

---

## 14. Concrete migration path from current `wsync`

## Step 1
Create SSH aliases for both machines and stop hardcoding IPs in the script.

## Step 2
Replace `$(pwd)` behavior with a profile lookup.

## Step 3
Model 2–3 real profiles first, for example:

- `hibase-umbrella`
- `current-client-x`
- `shared-secrets`

## Step 4
Move current excludes into:

- `common`
- `elixir`
- `node`
- `python`
- `terraform`

## Step 5
Adopt `repo-local` mode for Git repos.

That is the key safety move.

## Step 6
Add `.peek` discovery and explicit dependency roots.

---

## 15. Suggested initial profiles to model first

Start with the smallest set that proves the design:

1. **`hibase-umbrella`**
   - umbrella repo local-only files
   - `.peek/`
   - 2–4 actually required `~/Projects/Elixir/...` roots
   - relevant secrets root

2. **`shared-secrets`**
   - one or more plain secret directories

3. **`sandbox` or `notes`**
   - a non-Git plain-dir case

This will test:

- repo-local includes
- cross-root profile behavior
- secret sync
- exclude presets
- portability

---

## 16. Risk register

## Risk: accidental overwrite of Git-tracked files
**Mitigation:** `repo-local` mode only syncs declared include paths; Git guard aborts otherwise.

## Risk: rsync incompatibility across machines
**Mitigation:** explicit binary resolution + portable flag subset + `doctor`.

## Risk: `.peek` expands into too much
**Mitigation:** discover only, no auto-follow.

## Risk: deletes remove important local state
**Mitigation:** no delete by default.

## Risk: both machines changed the same local-only file
**Mitigation:** start with explicit direction; add last-sync conflict detection in Phase 3.

---

## 17. Final recommendation

The best next `wsync` is **not** a bigger current-directory rsync command.

It is a:

- **profile-based**
- **workspace-aware**
- **Git-safe**
- **directional**
- **portable**
- **dry-run-first**

wrapper around `ssh` + `rsync`.

### The central design choices are:

1. **Profiles instead of `pwd`**
2. **Explicit roots instead of implicit tree walking**
3. **`repo-local` mode for Git repos**
4. **`.peek` as discovery input, not automatic traversal**
5. **No delete by default**
6. **Portable rsync mode with `doctor`**

If you follow those six rules, `~/Work` and `~/Projects` can evolve together in a clean way without becoming one giant dangerous mirror.

---

## 18. Proposed next implementation step

After this plan, the best next practical move is:

1. define the initial config structure
2. model the `hibase-umbrella` profile
3. implement Phase 1 MVP
4. test only with `plan`
5. then enable `pull`

That gets you from concept to useful daily tool with minimal surprise.
