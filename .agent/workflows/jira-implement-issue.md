---
description: Implement a ticket from Atlassian Jira
---

Plan and implement a given ticket (task, story, etc).

- Use the `acli` command line utility to interact with the Atlassian Jira API.
- You may use json output and `jq` to perform queries on the results of the API.
- Use `git` to handle pulling and branching.

The following steps are required:

- Make sure the user is authenticated with `acli jira auth`.
- Download all information about the issue using `acli jira workitem viwe KEY-123`.
- Investigate the project in the current directory and write an implementation plan.
- You may need to download images and other files from the issue.
- Images should be stored in a temporary directory and be used enrich the current plan.
- Clarify any unclear information with the user, and update the implementation plan.

Once a local issue has been written, the next steps are to implement the isuse on the repository:

- Handle feature branching, check for an existing branch or create a new one. Use `KEY-123-short-helpful-title` as the branch name.
- On existing branches, check out the branch and pull the latest changes, rebase with `origin/main` if necessary.
- On new branches, pull the latest changes and branch off `origin/main` for a clean start.
- Then proceed with the usual plan and implementation steps, respecting the current project.

Usage documentation on `acli`:

```
acli jira workitem view [key] [flags]
```

Examples for `acli jira workitem view`:

```
# View work item with work item keys
$ acli jira workitem view KEY-123

# View work item by reading work item keys from a JSON file
$ acli jira workitem view KEY-123 --json

# View work item with work item keys and a list of field to return
$ acli jira workitem view KEY-123 --fields summary,comment

# View work item with work item keys and view in a web browser
$ acli jira workitem view KEY-123 --web
```

Options for `acli jira workitem view`:

```
  -f, --fields string   A list of fields to return for the work item. This parameter accepts a comma-separated list. Use it to retrieve a subset of fields.
                        Allowed values:
                        - '*all' - returns all fields
                        - '*navigable' - returns navigable fields
                        Any work item field, prefixed with a minus to exclude
                        Examples:
                        - 'summary,comment' - returns only the summary and comments fields
                        - '-description' - returns all (default) fields except description
                        - '*navigable,-comment' - returns all navigable fields except comment
                         (default "key,issuetype,summary,status,assignee,description")
  -h, --help            Show help for command
      --json            Generate a JSON output
  -w, --web             View the work item in the web browser.
```

From the general documentation on: https://developer.atlassian.com/cloud/acli/reference

