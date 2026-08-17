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

## Global install

The current installer targets WSL, Linux, and other POSIX environments with `bash` available.

From a stable local checkout:

```bash
git clone https://github.com/luojiyin1987/opencode-review-bridge.git
cd opencode-review-bridge
npm run install-global
```

If the CLI wrapper was installed manually before this command existed, the equivalent update command is:

```bash
opencode-review-bridge install
```

The installer creates or updates these bridge-managed files:

```text
~/.local/bin/opencode-review-bridge
~/.config/opencode/commands/review-pull.md
~/.config/opencode/commands/review-push.md
~/.config/opencode/commands/review-status.md
```

The CLI wrapper points at the checkout where the install command was run. Pulling new bridge source updates therefore changes CLI behavior immediately; rerun `opencode-review-bridge install` when the checkout moves or the OpenCode command templates change.

Installation is idempotent for bridge-managed files. If a global `review-pull.md`, `review-push.md`, `review-status.md`, or CLI wrapper already exists and does not look bridge-managed, installation stops instead of overwriting it.

If the installer warns that `~/.local/bin` is not on `PATH`, add it to the shell environment before using the CLI:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Then verify:

```bash
opencode-review-bridge --help
```

Once installed, start OpenCode from any PR-backed repository and use:

```text
/review-pull
/review-push
/review-status
```

## Pull a reviewer handoff

From a checkout whose current branch has a pull request:

```bash
opencode-review-bridge review-pull
```

The command returns one of three explicit states:

- `READY`: the newest executor handoff matches the current PR revision and its body is emitted as task context
- `STALE`: the newest executor handoff targets another revision; the old task body is not emitted
- `NONE`: there is no actionable plan or change request

The OpenCode command is:

```text
/review-pull
```

The repository-local npm script remains available while developing the bridge itself:

```bash
npm run review-pull
```

## Push an implementation result

`review-push` publishes a v1 `implementation_result` packet for the current PR head. It accepts a small JSON report instead of raw logs or conversation history:

```json
{
  "addressed": ["Implemented the requested fix."],
  "validation": ["npm test: PASS"],
  "remainingConcerns": []
}
```

The `## Changed` section is not supplied by the executor. The bridge reads the canonical filenames from the current GitHub pull request and includes them in the published handoff. Legacy input files that still contain an extra `changed` field remain readable, but that field is ignored.

Run it with:

```bash
opencode-review-bridge review-push --file .git/opencode-review-bridge-result.json
```

Before posting, the command requires:

- a clean working tree
- local `HEAD` to match the current GitHub PR head

This prevents local-only or unpushed changes from being advertised as `ready_to_review`.

The OpenCode command is:

```text
/review-push
```

It asks OpenCode to summarize only observed implementation and validation results into a temporary JSON file under `.git/`, invoke the CLI, and remove the temporary file. Changed filenames are derived from GitHub rather than model-authored text. It does not automatically commit, push, or merge code.

## Submit a reviewer decision

`review-submit` is the reviewer-side publishing primitive. It converts a small structured review report into a v1 `review` packet bound to the current PR head:

```json
{
  "decision": "changes_requested",
  "summary": ["Reviewed the current implementation result."],
  "mustFix": ["Add a regression test for the stale-head case."],
  "notes": []
}
```

A human reviewer can submit a report file:

```bash
opencode-review-bridge review-submit --file .git/opencode-review-bridge-review.json
```

Integrations that already have the JSON in memory can stream the same report without creating a temporary file:

```bash
cat review.json | opencode-review-bridge review-submit --stdin
```

Exactly one input mode is required. `--stdin` reads one JSON document from piped input and applies the same report validation and current-head guards as `--file`. If `--stdin` is invoked directly from an interactive terminal without a pipe, the CLI refuses the request instead of waiting for EOF.

The command only publishes when the latest valid v1 handoff is a current `implementation_result / ready_to_review`. This prevents a reviewer from skipping the executor result or reviewing an older PR revision.

Review report rules:

- `decision` is either `changes_requested` or `approved`
- `summary` must contain at least one item
- `changes_requested` must contain at least one `mustFix` item
- `approved` must not contain any `mustFix` items

This command is intentionally not installed as an OpenCode slash command because it belongs to the reviewer role. A ChatGPT integration, human reviewer, MCP adapter, or future API integration can produce the same structured decision and publish the equivalent v1 packet through GitHub.

## Inspect bridge status

`review-status` is read-only. It shows the latest valid v1 handoff on the current pull request without deciding whether that handoff is actionable for the executor or reviewer:

```bash
opencode-review-bridge review-status
```

The output includes the latest packet `Kind`, `State`, source comment, and its relation to the current PR head:

- `CURRENT`: the handoff targets the current PR revision
- `STALE`: the handoff targets another revision
- `UNBOUND`: a pre-implementation plan is not bound to a commit yet
- `Handoff: NONE`: no valid v1 handoff exists on the PR

The OpenCode command is:

```text
/review-status
```

It only reports state; it does not modify files, publish results, or merge the pull request.

## Scope

The first usable version stays deliberately small:

1. define the handoff protocol
2. pull the latest actionable handoff from the current GitHub PR
3. turn it into an OpenCode task
4. push an implementation result back to the PR
5. publish an explicit reviewer decision for the current implementation result
6. inspect the latest bridge state without acting on it
7. install the executor commands for reuse across local repositories
8. keep the user in control of every review/fix iteration

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
opencode-review-bridge install
opencode-review-bridge review-submit (--file <review.json> | --stdin)
/review-pull
/review-push
/review-status
```
