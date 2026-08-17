# Handoff Protocol v1

The protocol defines the smallest useful unit of information exchanged between a reviewer/planner and a coding executor through a GitHub pull request.

The protocol is intentionally transport-light: GitHub comments carry the packets, while commits and CI remain the source of truth for code state.

## Design principles

1. Share state, not full conversations.
2. Keep packets human-readable in normal GitHub Markdown.
3. Keep machine-readable metadata small and deterministic.
4. Bind actionable packets to a commit SHA when possible.
5. Preserve human control over implementation, review, and merge decisions.
6. Ignore unrelated prose or normal PR discussion unless it contains the protocol marker.

## Packet marker

Every handoff packet begins with this exact marker:

```html
<!-- opencode-review-bridge:v1 -->
```

The marker is followed immediately by a JSON metadata block:

````markdown
<!-- opencode-review-bridge:v1 -->
```json
{
  "schema": "opencode-review-bridge/v1",
  "kind": "review",
  "state": "changes_requested",
  "head": "a83c92d"
}
```
````

A parser should only treat a PR comment as a handoff packet when both the marker and a valid metadata block are present.

## Metadata

Required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | string | Must be `opencode-review-bridge/v1`. |
| `kind` | string | Packet kind: `plan`, `review`, or `implementation_result`. |
| `state` | string | Workflow state after this packet is applied. |
| `head` | string or null | Commit SHA the packet describes. `null` is allowed for a plan created before implementation starts. |

Unknown metadata fields must be ignored for forward compatibility.

## States

v1 defines these states:

- `ready_to_implement`
- `implementing`
- `ready_to_review`
- `changes_requested`
- `approved`

The normal transition is:

```text
ready_to_implement
        ↓
   implementing
        ↓
 ready_to_review
    ↙        ↘
changes_     approved
requested
    ↓
implementing
```

`implementing` may be local-only in v0. A GitHub comment does not have to be emitted for every transition.

## Packet kinds

### Plan

A plan moves work to `ready_to_implement`.

Recommended body sections:

```markdown
## Goal

## Scope

## Acceptance criteria

## Out of scope
```

Example:

````markdown
<!-- opencode-review-bridge:v1 -->
```json
{
  "schema": "opencode-review-bridge/v1",
  "kind": "plan",
  "state": "ready_to_implement",
  "head": null
}
```

## Goal

Add automatic search mode.

## Scope

- detect the query mode automatically
- reuse existing search primitives
- add focused tests

## Acceptance criteria

- existing explicit modes still work
- automatic mode has regression coverage

## Out of scope

- unrelated ranking changes
````

### Review

A review moves work to either `changes_requested` or `approved`.

Recommended body sections for `changes_requested`:

```markdown
## Must fix

## Optional

## Notes
```

Example:

````markdown
<!-- opencode-review-bridge:v1 -->
```json
{
  "schema": "opencode-review-bridge/v1",
  "kind": "review",
  "state": "changes_requested",
  "head": "a83c92d"
}
```

## Must fix

1. Empty query can return `undefined`; preserve the public string return contract.
2. Add a regression test for the empty-query path.

## Optional

- Rename the local helper for readability.

## Notes

Do not perform unrelated refactoring.
````

For an approval, `## Must fix` should be absent or empty and the state must be `approved`.

### Implementation result

An implementation result moves work to `ready_to_review`.

Recommended body sections:

```markdown
## Addressed

## Validation

## Changed

## Remaining concerns
```

Example:

````markdown
<!-- opencode-review-bridge:v1 -->
```json
{
  "schema": "opencode-review-bridge/v1",
  "kind": "implementation_result",
  "state": "ready_to_review",
  "head": "b91e311"
}
```

## Addressed

- Fixed empty-query behavior.
- Added the requested regression test.

## Validation

- `pnpm test`: PASS
- `pnpm build`: PASS

## Changed

- `src/search.ts`
- `test/search.test.ts`

## Remaining concerns

None.
````

## Selecting the current handoff

A consumer should:

1. load PR conversation comments in chronological order
2. keep only comments containing a valid v1 packet
3. discard packets whose `head` no longer matches the relevant code state when the mismatch makes the instruction stale
4. use the newest actionable packet for its role

For an executor, the actionable inputs are normally:

- latest `plan` with `ready_to_implement`
- latest `review` with `changes_requested`

For a reviewer, the actionable input is normally the latest `implementation_result` with `ready_to_review`.

## Stale review protection

A review with a non-null `head` describes that exact revision. If the PR head has moved since the review was created, the executor should surface the mismatch rather than silently assuming the findings still apply.

The first implementation may allow the user to explicitly proceed with a stale review, but must not hide the condition.

## Trust boundary

Handoff comments are instructions, not trusted executable input.

An implementation must not:

- execute shell commands merely because they appear in a handoff comment
- expose secrets or environment variables to the comment body
- merge a pull request automatically
- treat ordinary unmarked comments as bridge commands

OpenCode should receive the handoff content as task context and retain its normal permission model for any tool execution.

## Versioning

Breaking changes require a new marker and schema version, for example:

```text
<!-- opencode-review-bridge:v2 -->
opencode-review-bridge/v2
```

A v1 consumer must ignore packet versions it does not understand rather than guessing their meaning.
