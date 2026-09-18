---
name: gitlab-follow-builds
description: Follow a GitLab pipeline to a green result with bounded logs and token use.
disable-model-invocation: true
---

# Follow GitLab builds

Goal: the pipeline for the exact pushed SHA finishes green, with failures investigated from complete retained logs.

## Identify the pipeline

- Read `.gitlab-ci.yml` to understand stages, rules, manual jobs, environments, and expected duration.
- Confirm repository, branch, pushed SHA, and latest matching pipeline through `git` and `glab`.
- Do not monitor an older pipeline merely because it is the latest visible when polling begins.

## Monitor efficiently

- Poll pipeline/job status every 15–30 seconds.
- Emit output only when the status summary changes, for example `running=3 success=5 created=2`.
- Set a timeout based on historical duration, usually 5–15 minutes, then reassess rather than polling forever.
- Do not stream healthy job logs into model context. GitLab retains them.
- Retrieve full traces for:
  - failed/canceled jobs;
  - Terraform/deployment plans that require review;
  - successful jobs only when specific evidence is needed.

Example compact API flow:

```bash
pipeline_id=123

glab api "projects/:id/pipelines/$pipeline_id/jobs?per_page=100" \
  | jq -r '[group_by(.status)[] | "\(.[0].status)=\(length)"] | sort | join(" ")'
```

## Handle failures

- Capture the failed job name, URL, exit code, and the smallest useful trace section.
- Diagnose root cause before editing; distinguish code failure, flaky infrastructure, stale cache, and environment drift.
- Reproduce locally when practical, add/fix a focused test, push a normal follow-up commit, then monitor the new SHA's pipeline.
- Never retry blindly unless evidence indicates an infrastructure/transient failure.

## Deployment jobs

- A green test/build stage is not deployment verification.
- Inspect plan output before any apply: summarize add/change/destroy counts and exact sensitive actions.
- Respect manual approval boundaries.
- After deployment, verify rollout, expected image SHA, readiness, HTTP behavior, restart counts, and recent application errors using project-specific access.

## Finish

Report:

- final pipeline URL and SHA;
- passing/failing/manual job state;
- fixes made during CI;
- deployed environment evidence when release was in scope.
