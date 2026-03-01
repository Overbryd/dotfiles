---
description: Implement an issue from Gitlab
---

Plan and implement a given issue.

- Use the `glab` command line utility to interact with the Gitlab API.
- You may use json output and `jq` to perform queries on the Gitlab API.
- Use `git` to handle pulling and branching.

The following steps are required:

- Download all information about the issue using `glab issue view`.
- Investigate the project and write an implementation plan.
- You may need to download images and other files from the issue.
- Images should be stored in a temporary directory and be used enrich the current plan.
- Clarify any unclear information with the user, and update the implementation plan.

Once a local issue has been written, the next steps are to implement the isuse on the repository:

- Handle feature branching, check for an existing branch or create a new one. Use `ISSUE_NO-short-helpful-title` as the branch name.
- On existing branches, check out the branch and pull the latest changes, rebase with `origin/main` if necessary.
- On new branches, pull the latest changes and branch off `origin/main` for a clean start.
- Then proceed with the usual plan and implementation steps, respecting the current project.

Usage documentation on `glab`:

```
# Global options
#
#   --repo OWNER/REPO         Select another repository. Can use either OWNER/REPO or `GROUP/NAMESPACE/REPO` format. Also accepts full URL or Git URL.
```

Display the title, body, and other information about an issue.

```
# glab issue view <id> [flags]

$ glab issue view

# Options
#
#   --comments        Show issue comments and activities.
#   --output string   Format output as: text, json. (default "text")
#   --page int        Page number. (default 1)
#   --per-page int    Number of items to list per page. (default 20)
#   --system-logs     Show system activities and logs.
#   --web             Open issue in a browser. Uses the default browser, or the browser specified in the $BROWSER variable.
```

From the general documentation on: https://docs.gitlab.com/cli/ci/

