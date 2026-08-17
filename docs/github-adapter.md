# GitHub Handoff Adapter

The GitHub adapter is the transport layer between the v1 handoff protocol and a pull request conversation.

It deliberately depends on the authenticated GitHub CLI instead of embedding another GitHub client or token flow.

## Responsibilities

The adapter can:

- discover the pull request for the current branch
- read all pull request conversation comments through the issues comments API
- parse and retain valid v1 handoff packets
- select the newest role-relevant handoff
- surface stale handoffs when their recorded head no longer matches the pull request head
- post formatted handoff packets back to the pull request

## Selection behavior

Selection returns one of three statuses:

- `ready`: the newest role-relevant handoff applies to the current pull request head
- `stale`: the newest role-relevant handoff targets another head revision
- `none`: no role-relevant handoff exists

A stale handoff is never silently replaced by an older actionable packet. The caller must surface the mismatch and decide what to do next.

## Trust boundary

The adapter never executes text from a handoff packet.

The default GitHub CLI runner invokes `gh` directly with an argument array and `shell: false`. Handoff bodies are sent as JSON through stdin when creating comments.

This keeps the transport responsible only for reading and writing state. OpenCode remains responsible for deciding which tools and commands may be executed while implementing a task.
