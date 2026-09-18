---
name: terraform
description: Safe, low-token Terraform workflows. Use whenever reading, changing, planning, applying, or monitoring Terraform.
---

# Terraform: low-token, full-safety workflow

Goal: model sees action list, risk, prompt, errors, completion. Full output remains recoverable.

## Rules

1. Run Terraform in dedicated tmux pane/window. Never pipe interactive `apply` through `grep`, `tee`, or `yes`.
2. Add `-no-color -compact-warnings` where supported.
3. Prefer saved plans: `terraform plan -out=/tmp/<name>.tfplan`. Apply exact file after review.
4. Summarize saved plan with same Terraform binary and original config directory: `TERRAFORM_BIN=/path/to/terraform bash scripts/tf-plan-summary /tmp/<name>.tfplan path/to/stack`.
5. For direct interactive applies, inspect pane with `bash scripts/tf-pane-summary <tmux-target>`.
6. Before approval, require explicit counts and inspect every replacement/delete. Unexpected destroy means stop.
7. Approve with one explicit `yes` only after review. Never use `-auto-approve` or `yes | terraform`.
8. During long applies, poll filtered pane every 30-300 seconds. Do not repeatedly ingest full output.
9. Keep refresh enabled by default. Use `-refresh=false` only immediately after a successful fresh plan/apply against same state, when avoiding duplicate API reads; say why.
10. Sanitize inherited `TF_VAR_*`, `GOOGLE_*`, and direnv values. Print/select exact target project, backend prefix, workspace, and Terraform binary version before mutation.
11. After apply, check `Apply complete`, relevant live resources, and remote state `terraform_version`/`serial`.
12. Cloud Build: query `PENDING` as well as `WORKING`. `--ongoing` may omit builds waiting for manual approval.

## Typical sequence

```bash
terraform plan -no-color -compact-warnings -out=/tmp/change.tfplan
TERRAFORM_BIN="$(command -v terraform)" \
  bash ~/.pi/agent/skills/terraform/scripts/tf-plan-summary \
  /tmp/change.tfplan "$PWD"
terraform apply -no-color -compact-warnings /tmp/change.tfplan
```

For a command already running in tmux:

```bash
bash ~/.pi/agent/skills/terraform/scripts/tf-pane-summary session:window
```

Cloud Build terminal-state audit:

```bash
gcloud builds list --project="$PROJECT" \
  --filter='status=PENDING OR status=QUEUED OR status=WORKING' \
  --format='table(id,status,buildTriggerId,createTime)'
```

## Review standard

Report only:

- target stack/project/backend/Terraform version
- changed resource addresses grouped by create/update/replace/delete
- `Plan: X to add, Y to change, Z to destroy`
- approval prompt
- errors with short context
- `Apply complete! Resources: ...`
- focused live verification

Never hide replacement/delete details merely to save tokens. Safety beats brevity.
