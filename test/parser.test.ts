import assert from 'node:assert/strict'
import test from 'node:test'

import { parseHandoff } from '../src/parser.ts'

const marker = '<!-- opencode-review-bridge:v1 -->'

function comment(metadata: unknown, body = '## Body\n\nHello'): string {
  return `${marker}\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n${body}`
}

test('parses a valid v1 packet and ignores unknown metadata fields', () => {
  const parsed = parseHandoff(comment({
    schema: 'opencode-review-bridge/v1',
    kind: 'review',
    state: 'changes_requested',
    head: 'a83c92d',
    future: 'ignored',
  }))

  assert.deepEqual(parsed, {
    metadata: {
      schema: 'opencode-review-bridge/v1',
      kind: 'review',
      state: 'changes_requested',
      head: 'a83c92d',
    },
    body: '## Body\n\nHello',
  })
})

test('accepts CRLF comments', () => {
  const input = comment({
    schema: 'opencode-review-bridge/v1',
    kind: 'plan',
    state: 'ready_to_implement',
    head: null,
  }).replace(/\n/g, '\r\n')

  assert.equal(parseHandoff(input)?.metadata.kind, 'plan')
})

test('ignores ordinary comments without the marker', () => {
  assert.equal(parseHandoff('Looks good to me.'), null)
})

test('rejects prose before the marker', () => {
  const input = `Please fix this.\n${comment({
    schema: 'opencode-review-bridge/v1',
    kind: 'plan',
    state: 'ready_to_implement',
    head: null,
  })}`

  assert.equal(parseHandoff(input), null)
})

test('rejects malformed JSON', () => {
  assert.equal(parseHandoff(`${marker}\n\`\`\`json\n{ nope }\n\`\`\``), null)
})

test('rejects unknown schema versions', () => {
  assert.equal(parseHandoff(comment({
    schema: 'opencode-review-bridge/v2',
    kind: 'review',
    state: 'changes_requested',
    head: 'a83c92d',
  })), null)
})

test('rejects invalid kind/state combinations', () => {
  assert.equal(parseHandoff(comment({
    schema: 'opencode-review-bridge/v1',
    kind: 'plan',
    state: 'approved',
    head: null,
  })), null)
})

test('rejects missing or invalid commit heads', () => {
  assert.equal(parseHandoff(comment({
    schema: 'opencode-review-bridge/v1',
    kind: 'review',
    state: 'changes_requested',
    head: null,
  })), null)

  assert.equal(parseHandoff(comment({
    schema: 'opencode-review-bridge/v1',
    kind: 'implementation_result',
    state: 'ready_to_review',
    head: 'main',
  })), null)
})
