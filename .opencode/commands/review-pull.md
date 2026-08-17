---
description: Pull the latest actionable reviewer handoff from the current PR
---

Fetch the latest executor handoff for the current pull request:

!`npm run --silent review-pull`

Follow the bridge status exactly:

- If `Status: READY`, implement only the task under `## Handoff`, obey the execution rules, run the relevant checks, and summarize the result.
- If `Status: STALE`, do not modify files. Explain that the reviewer handoff targets an older revision and needs to be refreshed.
- If `Status: NONE`, do not modify files. Explain that there is no actionable reviewer handoff yet.

Do not reinterpret a stale or missing handoff as permission to continue older work.
