import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { main } from '../src/cli.ts'
import type { HandoffComment, PullRequestContext } from '../src/github.ts'
import {
  GitWorkspace,
  normalizeImplementationReport,
  renderImplementationReport,
  reviewPush,
  type ImplementationReport,
  type ReviewPushSource,
  type ReviewPushWorkspace,
} from '../src/review-push.ts'
import type { HandoffPacket } from '../src/protocol.ts'

const HEAD = 'abcdef0123456789abcdef0123456789abcdef01'

const context: PullRequestContext = {
  repository: 'owner/repo',
  number: 5,
  url: 'https://github.com/owner/repo/pull/5',
  head: HEAD,
}

const report: ImplementationReport = {
  addressed: ['Implemented review-push orchestration.'],
  validation: ['npm test: PASS'],
  changed: ['src/review-push.ts', 'test/review-push.test.ts'],
  remainingConcerns: [],
}

function source(onPost?: (packet: HandoffPacket) => void): ReviewPushSource {
  return {
    getCurrentPullRequest() {
      return context
    },
    postHandoff(packet, receivedContext) {
      assert.equal(receivedContext, context)
      onPost?.(packet)
      const comment: HandoffComment = {
        id: 55,
        url: 'https://github.com/owner/repo/pull/5#issuecomment-55',
        createdAt: '2026-08-17T08:00:00Z',
        packet,
      }
      return comment
    },
  }
}

function workspace(state = { head: HEAD, clean: true }): ReviewPushWorkspace {
  return { getState: () => state }
}

test('renders a concise implementation result body', () => {
  const body = renderImplementationReport(report)

  assert.match(body, /## Addressed/)
  assert.match(body, /Implemented review-push orchestration/)
  assert.match(body, /npm test: PASS/)
  assert.match(body, /src\/review-push\.ts/)
  assert.match(body, /## Remaining concerns\n\nNone\./)
})

test('posts an implementation_result bound to the current PR head', () => {
  let posted: HandoffPacket | undefined
  const output = reviewPush(report, source((packet) => { posted = packet }), workspace())

  assert.equal(posted?.metadata.kind, 'implementation_result')
  assert.equal(posted?.metadata.state, 'ready_to_review')
  assert.equal(posted?.metadata.head, HEAD)
  assert.match(posted?.body ?? '', /npm test: PASS/)
  assert.match(output, /Status: POSTED/)
  assert.match(output, /issuecomment-55/)
})

test('rejects a dirty working tree before posting', () => {
  let posted = false

  assert.throws(
    () => reviewPush(report, source(() => { posted = true }), workspace({ head: HEAD, clean: false })),
    /Working tree is not clean/,
  )
  assert.equal(posted, false)
})

test('rejects a local HEAD that has not reached the PR', () => {
  assert.throws(
    () => reviewPush(
      report,
      source(),
      workspace({ head: '1111111111111111111111111111111111111111', clean: true }),
    ),
    /does not match PR head/,
  )
})

test('normalizes report items and rejects multiline content', () => {
  assert.deepEqual(normalizeImplementationReport({
    addressed: ['  fixed item  '],
    validation: [],
    changed: [],
    remainingConcerns: [],
  }).addressed, ['fixed item'])

  assert.throws(() => normalizeImplementationReport({
    addressed: ['line one\nline two'],
    validation: [],
    changed: [],
    remainingConcerns: [],
  }), /single-line/)
})

test('GitWorkspace reads HEAD and clean state without a shell', () => {
  const calls: string[][] = []
  const state = new GitWorkspace((args) => {
    calls.push([...args])
    if (args[0] === 'rev-parse') return `${HEAD}\n`
    return ''
  }).getState()

  assert.deepEqual(state, { head: HEAD, clean: true })
  assert.deepEqual(calls, [
    ['rev-parse', 'HEAD'],
    ['status', '--porcelain=v1', '--untracked-files=all'],
  ])
})

test('cli reads a JSON report file and invokes review-push', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-push-'))
  const path = join(directory, 'report.json')
  writeFileSync(path, JSON.stringify(report))

  let stdout = ''
  let received: ImplementationReport | undefined
  const io = {
    stdout: (value: string) => { stdout += value },
    stderr: (_value: string) => {},
  }

  try {
    const code = main(
      ['review-push', '--file', path],
      io,
      () => 'unused',
      (value) => {
        received = value
        return 'Status: POSTED'
      },
    )

    assert.equal(code, 0)
    assert.deepEqual(received, report)
    assert.equal(stdout, 'Status: POSTED\n')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('cli rejects review-push without an input file', () => {
  let stderr = ''
  const io = {
    stdout: (_value: string) => {},
    stderr: (value: string) => { stderr += value },
  }

  assert.equal(main(['review-push'], io), 1)
  assert.match(stderr, /requires --file/)
})
