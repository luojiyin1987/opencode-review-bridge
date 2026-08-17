import assert from 'node:assert/strict'
import test from 'node:test'

import { formatHandoff, isActionable } from '../src/formatter.ts'
import { parseHandoff } from '../src/parser.ts'
import type { HandoffPacket } from '../src/protocol.ts'

const review: HandoffPacket = {
  metadata: {
    schema: 'opencode-review-bridge/v1',
    kind: 'review',
    state: 'changes_requested',
    head: 'a83c92d',
  },
  body: '## Must fix\n\n1. Add the regression test.',
}

test('formats deterministic metadata and round-trips through the parser', () => {
  const formatted = formatHandoff(review)

  assert.match(formatted, /^<!-- opencode-review-bridge:v1 -->\n```json\n/)
  assert.deepEqual(parseHandoff(formatted), review)
})

test('throws when asked to format invalid metadata', () => {
  const invalid = {
    ...review,
    metadata: { ...review.metadata, state: 'ready_to_review' },
  } as HandoffPacket

  assert.throws(() => formatHandoff(invalid), /Invalid handoff metadata/)
})

test('marks executor inputs actionable', () => {
  assert.equal(isActionable(review, 'executor', 'a83c92d'), true)
  assert.equal(isActionable(review, 'reviewer', 'a83c92d'), false)
})

test('marks implementation results actionable for reviewers', () => {
  const result: HandoffPacket = {
    metadata: {
      schema: 'opencode-review-bridge/v1',
      kind: 'implementation_result',
      state: 'ready_to_review',
      head: 'b91e311',
    },
    body: '## Validation\n\nTests pass.',
  }

  assert.equal(isActionable(result, 'reviewer', 'b91e311'), true)
  assert.equal(isActionable(result, 'executor', 'b91e311'), false)
})

test('rejects stale packets when the current head differs', () => {
  assert.equal(isActionable(review, 'executor', 'deadbee'), false)
})

test('accepts short SHA prefixes for the same commit', () => {
  assert.equal(
    isActionable(review, 'executor', 'a83c92d0123456789abcdef0123456789abcdef0'),
    true,
  )
})

test('an approval is not actionable work for either role', () => {
  const approval: HandoffPacket = {
    metadata: {
      schema: 'opencode-review-bridge/v1',
      kind: 'review',
      state: 'approved',
      head: 'a83c92d',
    },
    body: 'Approved.',
  }

  assert.equal(isActionable(approval, 'executor', 'a83c92d'), false)
  assert.equal(isActionable(approval, 'reviewer', 'a83c92d'), false)
})
