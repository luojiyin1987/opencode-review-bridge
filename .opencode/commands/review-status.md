---
description: Show the latest review bridge state for the current PR
---

Inspect the current pull request bridge state:

!`npm run --silent review-status`

Report the status as read-only context. Do not modify files, run implementation work, publish a result, or merge the pull request because of this command.

Use the reported `Kind`, `State`, and `Revision` to explain where the handoff cycle currently stands. If `Revision: STALE`, make clear that the latest handoff targets another PR revision.
