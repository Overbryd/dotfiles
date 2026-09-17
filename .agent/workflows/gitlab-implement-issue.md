---
description: Refine, implement, validate, and optionally release one or more GitLab issues
---

# Implement GitLab issues

Use `glab` and the repository's existing workflow. Support either one issue or an explicitly ordered batch.

## 1. Intake and refinement

- Confirm the GitLab project from `git remote -v`.
- Read each issue, comments, labels, links, and attachments with `glab`.
- Download referenced images/files to a temporary directory when they affect acceptance criteria.
- Inspect the relevant code, tests, history, CI configuration, and operational docs before planning.
- Rewrite sparse descriptions into observable acceptance criteria. Ask only where materially different interpretations remain.
- For a batch, preserve the user's issue order and identify shared integration/release work separately from issue-specific work.

## 2. Protect the worktree and choose the delivery unit

- Fetch the target branch and inspect divergence before editing.
- Identify pre-existing modified/untracked files. Preserve them and exclude them from task commits.
- Follow project guidance for direct-main, feature branch, or merge-request delivery. If unspecified, prefer a feature branch named `<issue>-short-helpful-title`.
- For a batch, establish whether issues ship independently or as one release. Keep one focused commit per issue in requested order either way.

## 3. Implement issue by issue

For each issue:

1. Reproduce or characterize current behavior.
2. Add one focused failing test when practical.
3. Make the smallest change satisfying acceptance criteria.
4. Run focused tests and formatting.
5. Review the diff for scope, edge cases, race conditions, and unrelated changes.
6. Commit only that issue's files with a normal, descriptive message.

Do not repeatedly run the entire expensive suite after every low-risk issue. Run it when risk requires and once at the final integration boundary.

## 4. Integration gate

Determine project-specific commands (`mix precommit`, `make`, CI jobs, security scanners). At minimum:

- formatting/lint;
- warnings-as-errors or equivalent compile gate;
- complete unit/integration/E2E suite relevant to the project;
- dependency/security audits when dependencies changed;
- seed/migration validation when data setup changed;
- `git diff --check` and final worktree review.

Verify every changed line traces to an issue or an explicitly approved release fix.

## 5. Push and follow CI

- Fetch once more and confirm the remote target did not advance unexpectedly.
- Push the chosen branch/commits.
- Follow the exact pipeline for the pushed SHA.
- Use compact status polling; retrieve full traces only for failures and deployment plans.
- Fix failures with focused follow-up commits. Never hide warnings merely to make CI green.

See `gitlab-follow-builds.md` for monitoring details.

## 6. Staging and production

Only perform release steps when the user requested them and project policy allows it.

- Verify staging image SHA, rollout readiness, HTTP behavior, restart counts, and recent logs.
- Inspect the production plan for exact changes and destructive actions.
- Ask immediately before production apply unless the user has explicitly approved that exact reviewed plan.
- After apply, verify the production image SHA, rollout, health endpoint/page, restart counts, logs, and issue-specific behavior.
- Prefer deployed-system evidence over assuming a green deployment job proves application health.

## 7. Close out

- Add concise GitLab issue notes with behavior, tests, commit SHA, pipeline, and production evidence.
- Close issues only after their requested release/verification scope is complete, preserving the requested issue order.
- Report remaining risks, unrelated local changes, and links to pipeline/issues.
