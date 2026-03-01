---
description: Follow the builds on Gitlab
---

We want our last push to have a green pipeline.

- Use `.gitlab-ci.yml` to learn about the pipelines in the project.
- Use `git origin` to learn about the origin of the project.
- Use `git` to learn about the current branch, last commit and history.
- Use the `glab` command line utility to interact with the Gitlab API.
- You may use json output and `jq` to perform queries on the Gitlab API.

The following steps are required to follow the build:

- Identify the project, last commit and branch to find the right pipeline(s).
- Use the `glab ci` subcommand(s) to investigate the pipeline(s).
- **Wait for the relevant pipelines to start, run and complete.** Adjust the wait time to the past pipelines, usually 300 - 600 seconds.
- **Tail the logs of the pipeline** using `glab ci trace <job_id>` as the core technique to monitor progress and failures in real-time.
- If they do not succeed, download the logs for each failing step for investigation.
- For each failing step plan and implement a fix.
- Upon completion of all failed steps, present a summary to the user in the walkthrough.

