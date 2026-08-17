# opencode-review-bridge

A lightweight handoff protocol for using a reviewer/planner such as ChatGPT together with OpenCode as the coding executor.

The bridge intentionally uses GitHub pull requests as shared state instead of synchronizing full chat histories.

## Goal

Keep each agent focused on one role:

- reviewer/planner: define scope, review diffs, decide what must change
- executor: edit the repository, run checks, and report implementation results
- GitHub PR: persist handoff packets, commits, review history, and CI state

## Workflow

```text
Plan
  ↓
READY_TO_IMPLEMENT
  ↓
OpenCode implements and validates
  ↓
READY_TO_REVIEW
  ↓
Reviewer inspects the new diff
  ├─ CHANGES_REQUESTED → OpenCode fixes → READY_TO_REVIEW
  └─ APPROVED
```

The agents exchange small structured handoff packets instead of copying complete conversations between tools.

See [docs/protocol.md](docs/protocol.md) for the v1 packet format and state transitions.

## Requirements

The v0 GitHub transport expects:

- Node.js 22.6 or newer
- the GitHub CLI (`gh`) installed and authenticated
- a local checkout whose current branch has a GitHub pull request

The adapter invokes `gh` directly with argument arrays and passes comment bodies through stdin; it does not execute handoff text as shell input.

## Scope

The first usable version will stay deliberately small:

1. define the handoff protocol
2. pull the latest actionable handoff from the current GitHub PR
3. turn it into an OpenCode task
4. push an implementation result back to the PR
5. keep the user in control of every review/fix iteration

## Non-goals for v0

- no database
- no hosted service
- no web UI
- no MCP server
- no full conversation synchronization
- no autonomous merge

## Planned commands

```text
/review-pull
/review-status
/review-push
```

The exact OpenCode integration will be implemented after the v1 handoff protocol is stable.
