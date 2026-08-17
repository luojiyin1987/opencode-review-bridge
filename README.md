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

## Pull a reviewer handoff

From a checkout whose current branch has a pull request:

```bash
npm run review-pull
```

The command returns one of three explicit states:

- `READY`: the newest executor handoff matches the current PR revision and its body is emitted as task context
- `STALE`: the newest executor handoff targets another revision; the old task body is not emitted
- `NONE`: there is no actionable plan or change request

This repository also includes a project-local OpenCode command at `.opencode/commands/review-pull.md`. While developing the bridge itself, run this in the OpenCode TUI:

```text
/review-pull
```

The command injects the CLI output into the OpenCode prompt. `STALE` and `NONE` explicitly instruct the agent not to modify files.

Packaging the command for reuse from unrelated repositories is intentionally left for a later change.

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

## Commands

Implemented:

```text
/review-pull
```

Planned:

```text
/review-status
/review-push
```
