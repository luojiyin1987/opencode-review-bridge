import assert from 'node:assert/strict'
import test from 'node:test'

import { main } from '../src/cli.ts'
import type { ReviewReport } from '../src/review-submit.ts'

function captureIo() {
  let stdout = ''
  let stderr = ''
  return {
    io: {
      stdout: (value: string) => { stdout += value },
      stderr: (value: string) => { stderr += value },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  }
}

test('cli reads a reviewer report from stdin and publishes it', () => {
  const output = captureIo()
  let received: ReviewReport | null = null

  const result = main(
    ['review-submit', '--stdin'],
    output.io,
    () => 'unused',
    () => 'unused',
    () => ({ wrapperPath: '/tmp/orb', commandPaths: [], pathWarning: false }),
    () => 'unused',
    (report) => {
      received = report
      return 'Status: POSTED'
    },
    () => JSON.stringify({
      decision: 'approved',
      summary: ['Looks good.'],
      mustFix: [],
      notes: [],
    }),
  )

  assert.equal(result, 0)
  assert.equal(received?.decision, 'approved')
  assert.equal(output.stdout(), 'Status: POSTED\n')
  assert.equal(output.stderr(), '')
})

test('cli rejects malformed reviewer JSON from stdin', () => {
  const output = captureIo()

  const result = main(
    ['review-submit', '--stdin'],
    output.io,
    () => 'unused',
    () => 'unused',
    () => ({ wrapperPath: '/tmp/orb', commandPaths: [], pathWarning: false }),
    () => 'unused',
    () => 'unused',
    () => '{ nope }',
  )

  assert.equal(result, 1)
  assert.match(output.stderr(), /Could not parse reviewer report from stdin/)
})

test('cli requires exactly one review-submit input mode', () => {
  const missing = captureIo()
  assert.equal(main(['review-submit'], missing.io), 1)
  assert.match(missing.stderr(), /exactly one of --file <review\.json> or --stdin/)

  const conflicting = captureIo()
  assert.equal(main(
    ['review-submit', '--file', 'review.json', '--stdin'],
    conflicting.io,
  ), 1)
  assert.match(conflicting.stderr(), /exactly one of --file <review\.json> or --stdin/)
})
