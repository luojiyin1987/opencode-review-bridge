import assert from 'node:assert/strict'
import test from 'node:test'

import { main } from '../src/cli.ts'
import { renderReviewPull, reviewPull, type ReviewPullSource } from '../src/review-pull.ts'
import type { HandoffComment, HandoffSelection, PullRequestContext } from '../src/github.ts'

const context: PullRequestContext = {
  repository: 'owner/repo',
  number: 42,
  url: 'https://github.com/owner/repo/pull/42',
  head: 'abcdef0123456789abcdef0123456789abcdef01',
}

const readyComment: HandoffComment = {
  id: 9,
  url: 'https://github.com/owner/repo/pull/42#issuecomment-9',
  createdAt: '2026-08-17T00:00:00Z',
  packet: {
    metadata: {
      schema: 'opencode-review-bridge/v1',
      kind: 'review',
      state: 'changes_requested',
      head: 'abcdef0',
    },
    body: '## Must fix\n\n1. Add the missing regression test.',
  },
}

test('renders a ready handoff with executor boundary, execution guardrails, and body', () => {
  const output = renderReviewPull(context, { status: 'ready', comment: readyComment })

  assert.match(output, /Status: READY/)
  assert.match(output, /Kind: review/)
  assert.match(output, /## Executor boundary/)
  assert.match(output, /acting as the executor.*not as the reviewer/i)
  assert.match(output, /Do not invoke `\/review-push`.*`review-submit`/)
  assert.match(output, /Wait for an explicit user command before publishing an implementation result/)
  assert.match(output, /Do not merge the pull request/)
  assert.match(output, /Add the missing regression test/)
})

test('renders stale status without exposing the stale task body', () => {
  const selection: HandoffSelection = {
    status: 'stale',
    comment: readyComment,
    currentHead: context.head,
  }
  const output = renderReviewPull(context, selection)

  assert.match(output, /Status: STALE/)
  assert.match(output, /Handoff head: abcdef0/)
  assert.doesNotMatch(output, /Add the missing regression test/)
  assert.match(output, /Do not modify files/)
})

test('renders none status as a no-op', () => {
  const output = renderReviewPull(context, { status: 'none' })

  assert.match(output, /Status: NONE/)
  assert.match(output, /No actionable plan or change request/)
  assert.match(output, /Do not modify files/)
})

test('reviewPull resolves the current PR once and requests executor work', () => {
  const calls: string[] = []
  const source: ReviewPullSource = {
    getCurrentPullRequest() {
      calls.push('context')
      return context
    },
    getLatestHandoff(role, receivedContext) {
      calls.push(role)
      assert.equal(receivedContext, context)
      return { status: 'ready', comment: readyComment }
    },
  }

  const output = reviewPull(source)

  assert.deepEqual(calls, ['context', 'executor'])
  assert.match(output, /Status: READY/)
})

test('cli prints review-pull output and propagates failures as exit code 1', () => {
  let stdout = ''
  let stderr = ''
  const io = {
    stdout: (value: string) => { stdout += value },
    stderr: (value: string) => { stderr += value },
  }

  assert.equal(main(['review-pull'], io, () => 'Status: READY'), 0)
  assert.equal(stdout, 'Status: READY\n')
  assert.equal(stderr, '')

  stdout = ''
  assert.equal(main(['review-pull'], io, () => { throw new Error('boom') }), 1)
  assert.equal(stdout, '')
  assert.match(stderr, /review-pull failed: boom/)
})

test('cli shows help and rejects unknown commands', () => {
  let stdout = ''
  let stderr = ''
  const io = {
    stdout: (value: string) => { stdout += value },
    stderr: (value: string) => { stderr += value },
  }

  assert.equal(main(['--help'], io), 0)
  assert.match(stdout, /review-pull/)

  assert.equal(main(['wat'], io), 1)
  assert.match(stderr, /Unknown command: wat/)
})
