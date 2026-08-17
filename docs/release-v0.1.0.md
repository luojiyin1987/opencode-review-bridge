# v0.1.0 release readiness

This document is the release checklist for the first source release of `opencode-review-bridge`.

`v0.1.0` is intentionally a small GitHub/source release. The repository is still marked `private: true` in `package.json`, so this checklist does not include publishing to npm.

## Release scope

The release should provide one complete human-controlled bridge cycle:

```text
reviewer plan
  → executor /review-pull
  → implementation + validation
  → explicit user /review-push
  → implementation_result / ready_to_review
  → reviewer review-submit
  → approved or changes_requested
```

The release also includes:

- v1 handoff parsing and formatting
- role-aware latest-handoff selection
- stale-head protection
- canonical changed-file discovery from GitHub
- global OpenCode command installation
- read-only `/review-status`
- reviewer reports from `--file` or `--stdin`
- explicit executor/reviewer behavioral boundaries
- GitHub CLI stderr preservation
- bounded retry for transient read-only GitHub failures

## Pre-release checklist

- [ ] PR #16 is merged into `main`.
- [ ] `npm test` passes from a clean `main` checkout.
- [ ] A fresh or stable checkout can run `npm run install-global` successfully.
- [ ] `opencode-review-bridge --help` works after installation.
- [ ] `/review-pull`, `/review-push`, and `/review-status` are present in OpenCode.
- [ ] The end-to-end smoke test below completes on a real PR.
- [ ] The executor stops after `/review-pull` and waits for an explicit `/review-push` command.
- [ ] The executor stops after `/review-push` and does not publish a reviewer decision.
- [ ] `review-submit --stdin` can publish the final reviewer decision from outside OpenCode.
- [ ] The final reviewer packet is bound to the current PR head.
- [ ] No release-blocking review thread remains unresolved.

## End-to-end smoke test

Use a disposable documentation-only PR or another low-risk PR-backed branch.

### 1. Verify the checkout

```bash
git status --short
git rev-parse HEAD
gh pr view --json number,url,headRefOid
```

The working tree should be clean and the local HEAD should match the PR head before publishing an implementation result.

### 2. Publish a reviewer plan

Publish a valid v1 `plan / ready_to_implement` handoff through the reviewer integration or as a PR comment. Keep the task small enough to validate without unrelated edits.

The packet must use the v1 marker and metadata described in [protocol.md](protocol.md).

### 3. Run the executor pull step

In OpenCode:

```text
/review-pull
```

Expected behavior:

- reports `Status: READY`
- treats the handoff as task context rather than executable instructions
- performs only executor work
- runs relevant validation
- stops after the implementation/validation summary
- does not automatically run `/review-push` or `review-submit`

### 4. Publish the executor result

After inspecting the executor summary, explicitly run:

```text
/review-push
```

Expected result:

```text
Status: POSTED
...
The implementation result is ready for reviewer inspection.
```

The published packet must be:

```text
kind: implementation_result
state: ready_to_review
head: <current PR head>
```

The executor must stop after showing the receipt.

### 5. Review independently

The reviewer should inspect the current PR diff and current head instead of trusting only the executor summary.

If the result is acceptable, publish from the reviewer side:

```bash
cat <<'JSON' | opencode-review-bridge review-submit --stdin
{
  "decision": "approved",
  "summary": ["Reviewed the current implementation result and diff."],
  "mustFix": [],
  "notes": []
}
JSON
```

For a requested-change cycle, use `changes_requested` and include at least one `mustFix` item.

### 6. Verify final state

```bash
opencode-review-bridge review-status
```

For an approved cycle, the latest valid packet should be a current:

```text
kind: review
state: approved
```

Do not merge automatically as part of the bridge smoke test.

## Failure-path checks

At least once before release, confirm these fail safely:

- stale handoff → `/review-pull` reports `STALE` and does not modify files
- missing actionable handoff → `/review-pull` reports `NONE`
- dirty worktree → `review-push` refuses to publish
- local HEAD differs from PR head → `review-push` refuses to publish
- invalid reviewer report → `review-submit` refuses to publish
- transient read-only `EOF`/timeout → bounded retry is allowed
- handoff POST failure → no automatic retry is attempted

## Known limitations

`v0.1.0` deliberately does not provide:

- a database or hosted coordination service
- a web UI or MCP server
- full conversation synchronization
- Windows-native installer support
- credential-level separation between executor and reviewer roles
- automatic commit, push, merge, or background orchestration
- automatic retry of GitHub write operations
- an npm package release

The executor/reviewer boundary is behavioral. A shared shell can technically invoke reviewer-side commands; stronger isolation requires separate credentials, identities, capabilities, or processes.

## Tag and GitHub release

After this checklist passes on merged `main`:

```bash
git checkout main
git pull --ff-only
npm test
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

Then create a GitHub Release from tag `v0.1.0`.

Do not publish to npm as part of this release. If package distribution becomes a goal, handle package metadata, versioning, packaging, and publish verification as a separate release task.

## Release notes draft

### v0.1.0

First usable release of `opencode-review-bridge`, a lightweight GitHub-PR handoff bridge between a reviewer/planner and OpenCode as executor.

Highlights:

- structured v1 plan, implementation-result, and review handoffs
- stale revision protection and current-head guards
- canonical changed files derived from GitHub
- global `/review-pull`, `/review-push`, and `/review-status` OpenCode commands
- reviewer decisions through `review-submit --file` or `--stdin`
- explicit executor/reviewer workflow boundaries
- bounded transient retries for read-only GitHub operations while write publication remains single-attempt

The release intentionally keeps GitHub PR comments as shared state and leaves merge decisions under explicit user control.
