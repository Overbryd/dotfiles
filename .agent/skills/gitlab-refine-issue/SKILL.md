---
name: gitlab-refine-issue
description: Refine a rough GitLab issue into concise English while preserving the original request.
disable-model-invocation: true
---

# Refine GitLab issue

Turn rough customer request into implementation-ready ticket. Keep customer writing intact.

## 1. Read

- Confirm project with `git remote -v`.
- Read issue, comments, labels, links, attachments: `glab issue view <iid>`.
- Save original title and description before changing anything.
- Read nearby refined issues. Match local ticket style.
- Inspect relevant code and tests enough to learn real domain names, data flow, entry points, and likely effort. No implementation.
- Ask only when different interpretations materially change behavior or estimate.

## 2. Refine

Stay English, even when request German.

Use small structure:

```markdown
# Synopsis

Problem, user impact, desired behavior.

# Acceptance criteria

- [ ] Observable behavior
- [ ] Important boundary or unchanged behavior
- [ ] All relevant UI/API entry points
- [ ] Atomicity or failure behavior when relevant

# Estimate

8 hours

# Request

> Exact original text here.
```

Rules:

- Write concise, testable behavior. No solution theater.
- Use codebase terms where useful: exact states, entities, and operations.
- Separate outcome from mechanism. Include mechanism only when architecture makes it necessary.
- Cover boundaries: today vs future, cancel vs confirm, first transition vs later update.
- Distinguish UI and API behavior. UI may explain destructive side effects and require confirmation; API should not gain interactive ceremony unless requested.
- Improve title when current title vague. Describe user-visible outcome.
- Preserve original description verbatim under final `# Request` heading.
- Blockquote every original line. Preserve language, spelling, formatting, links, images, and blank-line structure. Do not silently correct customer text.
- Do not move later refinements into `Request`. Original stays immutable.

## 3. Estimate

Estimate implementation, focused tests, and relevant UI/API verification. Give one hour value unless uncertainty genuinely requires range.

Put estimate in both places:

- `# Estimate` section;
- GitLab native time estimate via API when available.

Follow-up estimate correction: change both. No argument.

## 4. Update safely

- Build full description in temporary file. Avoid shell quoting damage.
- Update title/description with `glab issue update`.
- Set native estimate through GitLab issue time-estimate API.
- On follow-up requests, edit only affected refined sections. Keep `Request` byte-for-byte unchanged.
- Never overwrite unseen comments or attachments.

## 5. Verify

Run `glab issue view <iid>` after update. Check:

- title clear;
- English refinement concise;
- acceptance criteria testable;
- UI/API differences explicit;
- body and native estimates agree;
- `Request` last;
- original customer text complete and unchanged.

Report issue link and estimate. Done.
