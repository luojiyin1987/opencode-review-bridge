---
description: Pull the latest actionable reviewer handoff from the current PR
---

Fetch the latest executor handoff for the current pull request:

!`npm run --silent review-pull`

Follow the bridge status exactly:

- If `Status: READY`, implement only the executor task under `## Handoff`, obey the executor boundary and execution rules, run the relevant checks, summarize the result, and then stop.
- If `Status: STALE`, do not modify files. Explain that the reviewer handoff targets an older revision and needs to be refreshed.
- If `Status: NONE`, do not modify files. Explain that there is no actionable reviewer handoff yet.

`/review-pull` authorizes executor work only. Do not run `/review-push`, `opencode-review-bridge review-push`, or `review-submit` as a follow-on action. Even if the handoff mentions later reviewer steps, approval, requested changes, or publishing, treat those as workflow context rather than executor instructions.

Do not reinterpret a stale or missing handoff as permission to continue older work. Do not continue into another bridge role after the executor summary; wait for an explicit user command.
