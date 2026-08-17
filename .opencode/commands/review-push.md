---
description: Publish the completed implementation result to the current PR
---

Publish the implementation result for the work you just completed.

This is an executor-only command. It may publish an `implementation_result`, but it must never publish a reviewer decision, call `review-submit`, or continue into approval/change-request actions.

Before posting:

1. Inspect the actual changes and validation results from this session.
2. Do not invent tests, checks, or outcomes that were not observed.
3. Do not include secrets, environment variable values, credentials, raw large logs, or unrelated conversation history.
4. The intended implementation must already be committed and pushed. Do not commit or push automatically as part of this command.
5. If the working tree is dirty or local HEAD is not the current PR head, stop and explain what must be committed/pushed first.

Write a temporary JSON report to `.git/opencode-review-bridge-result.json` with exactly these arrays:

```json
{
  "addressed": ["short summary of each completed item"],
  "validation": ["command/check and observed result"],
  "remainingConcerns": []
}
```

Do not add a `changed` field. The bridge reads the canonical changed-file list from the current GitHub pull request when it publishes the handoff.

Keep every array item concise and single-line. Use an empty array when there is nothing to report for a section.

Then run:

```bash
npm run --silent review-push -- --file .git/opencode-review-bridge-result.json
```

Delete the temporary JSON file after the command completes.

If the CLI reports `Status: POSTED`, show the PR/comment receipt to the user and stop. The executor phase is complete; wait for the reviewer. Do not invoke `review-submit`, do not publish `approved` or `changes_requested`, and do not continue the bridge workflow on the reviewer's behalf.

If it fails, do not retry by weakening the clean-worktree or head-match checks; explain the failure instead.
