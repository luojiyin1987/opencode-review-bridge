---
description: Show the latest review bridge state for the current PR
---

Inspect the current pull request bridge state:

!`npm run --silent review-status`

Report the status as read-only context. Do not modify files, run implementation work, publish a result, or merge the pull request because of this command.

Treat the command output as authoritative. Explain only what is explicitly encoded by `Handoff`, `Kind`, `State`, `Revision`, and `Next`.

Do not infer unreported history such as whether a plan was reviewed or approved, whether a planning phase is complete, or whether other lifecycle stages occurred. Do not invent additional lifecycle stages or transitions.

If `Revision: STALE`, make clear only that the latest handoff targets another PR revision. When a `Next:` line is present, preserve its meaning rather than deriving a different next action.
