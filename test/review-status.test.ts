import assert from 'node:assert/strict'
import test from 'node:test'

import { main } from '../src/cli.ts'
import {
  renderReviewStatus,
  reviewStatus,
  type ReviewStatusSource,
} from '../src/review-status.ts'
import type { HandoffComment, PullRequestContext } from '../src/github.ts'
import type { HandoffPacket } from '../src/protocol.ts'

const HEAD = 'abcdef0123456789abcdef0123456789abcdef01'
const OTHER_HEAD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const context: PullRequestContext = {
  repository: 'owner/repo',
  number: 42,
  url: 'https://github.com/owner/repo/pull/42',
  head: HEAD,
}

function comment(id: number, packet: HandoffPacket): HandoffComment {
  return {
    id,
    url: `https://github.com/owner/repo/pull/42#issuecomment-${id}`,
    createdAt: `2026-08-17T00:00:0${id}Z`,
    packet,
  }
}

test('renders the latest current handoff and next reviewer action', () => {
  const output = renderReviewStatus(context, [
    comment(1, {
      metadata: {
        schema: 'opencode-review-bridge/v1',
        kind: 'plan',
        state: 'ready_to_implement',
        head: HEAD,
      },
      body: 'implement',
    }),
    comment(2, {
      metadata: {
        schema: 'opencode-review-bridge/v1',
        kind: 'implementation_result',
        state: 'ready_to_review',
        head: HEAD,
      },
      body: 'done',
    }),
  ])

  assert.match(output, /Handoff: FOUND/)
  assert.match(output, /Kind: implementation_result/)
  assert.match(output, /State: ready_to_review/)
  assert.match(output, /Revision: CURRENT/)
  assert.match(output, /Reviewer should inspect the current PR head/)
})

test('renders stale when the latest handoff targets another revision', () => {
  const output = renderReviewStatus(context, [
    comment(1, {
      metadata: {
        schema: 'opencode-review-bridge/v1',
        kind: 'review',
        state: 'changes_requested',
        head: OTHER_HEAD,
      },
      body: 'fix',
    }),
  ])

  assert.match(output, /Revision: STALE/)
  assert.match(output, /Refresh the latest handoff/)
})

test('renders an unbound pre-implementation plan as actionable context', () => {
  const output = renderReviewStatus(context, [
    comment(1, {
      metadata: {
        schema: 'opencode-review-bridge/v1',
        kind: 'plan',
        state: 'ready_to_implement',
        head: null,
      },
      body: 'start',
    }),
  ])

  assert.match(output, /Revision: UNBOUND/)
  assert.match(output, /Handoff head: \(unbound\)/)
  assert.match(output, /Executor can run \/review-pull/)
})

test('renders none when the PR has no valid handoffs', () => {
  const output = renderReviewStatus(context, [])

  assert.match(output, /Handoff: NONE/)
  assert.match(output, /Await a valid v1 handoff/)
})

test('reviewStatus resolves the current PR once and lists all handoffs', () => {
  const calls: string[] = []
  const source: ReviewStatusSource = {
    getCurrentPullRequest() {
      calls.push('context')
      return context
    },
    listHandoffs(receivedContext) {
      calls.push('handoffs')
      assert.equal(receivedContext, context)
      return []
    },
  }

  assert.match(reviewStatus(source), /Handoff: NONE/)
  assert.deepEqual(calls, ['context', 'handoffs'])
})

test('cli prints review-status output and rejects arguments', () => {
  let stdout = ''
  let stderr = ''
  const io = {
    stdout: (value: string) => { stdout += value },
    stderr: (value: string) => { stderr += value },
  }
  const installResult = {
    wrapperPath: '/tmp/opencode-review-bridge',
    commandPaths: [],
    pathWarning: false,
  }

  assert.equal(
    main(
      ['review-status'],
      io,
      () => 'unused',
      () => 'unused',
      () => installResult,
      () => 'Handoff: FOUND',
    ),
    0,
  )
  assert.equal(stdout, 'Handoff: FOUND\n')
  assert.equal(stderr, '')

  stdout = ''
  assert.equal(
    main(
      ['review-status', 'extra'],
      io,
      () => 'unused',
      () => 'unused',
      () => installResult,
      () => 'unused',
    ),
    1,
  )
  assert.equal(stdout, '')
  assert.match(stderr, /review-status does not accept arguments/)
})
