---
name: wrapup
description: Wrap up an implementation with project-specific checks and a scoped diff review.
disable-model-invocation: true
---

# Wrap up implementation

- Re-read repository guidance and determine the canonical gate (`mix precommit`, `make`, language tooling, and CI jobs).
- Preserve and identify pre-existing worktree changes before staging anything.
- Run focused tests during implementation, then the complete relevant gate once at the final integration boundary.
- Include formatting, warnings-as-errors/lint, full relevant tests, migrations/seeds when touched, dependency audits when changed, and `git diff --check`.
- Review the final diff and commit list against acceptance criteria. Every changed line must trace to requested work or an explicitly approved release fix.
- Confirm no generated artifacts, credentials, local demo data, or unrelated files entered commits.
- If CI/deployment is in scope, follow the exact pushed SHA through completion and verify the deployed system—not only the job result.
- Report concise evidence: commands/results, commits, pipeline/deployment state, remaining risks, and preserved unrelated changes.
