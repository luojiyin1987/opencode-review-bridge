import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { main } from '../src/cli.ts'
import {
  normalizeReviewReport,
  renderReviewReport,
  reviewSubmit,
  type ReviewReport,
  type ReviewSubmitSource,
} from '../src/review-submit.ts'
import type { HandoffComment, PullRequestContext } from '../src/github.ts'
import type { HandoffPacket } from '../src/protocol.ts'

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER_HEAD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const CONTEXT: PullRequestContext = {
  repository: 'owner/repo',
  number: 9,
  url: 'https://github.com/owner/repo/pull/9',
  head: HEAD,
}

function handoff(
  kind: HandoffPacket['metadata']['kind'],
  state: HandoffPacket['metadata']['state'],
  head: string | null,
): HandoffComment {
  return {
    id: 10,
    url: 'https://github.com/owner/repo/pull/9#issuecomment-10',
    createdAt: '2026-08-17T09:00:00Z',
    packet: {
      metadata: {
        schema: 'opencode-review-bridge/v1',
        kind,
        state,
        head,
      },
      body: 'body',
    },
  }
}

function sourceWith(
  comments: HandoffComment[],
  posted: HandoffPacket[] = [],
): ReviewSubmitSource {
  return {
    getCurrentPullRequest() {
      return CONTEXT
    },
    listHandoffs(context) {
      assert.equal(context, CONTEXT)
      return comments
    },
    postHandoff(packet, context) {
      assert.equal(context, CONTEXT)
      posted.push(packet)
      return {
        id: 44,
        url: 'https://github.com/owner/repo/pull/9#issuecomment-44',
        createdAt: '2026-08-17T09:01:00Z',
        packet,
      }
    },
  }
}

test('normalizes and renders a changes-requested reviewer report', () => {
  const report = normalizeReviewReport({
    decision: 'changes_requested',
    summary: [' reviewed current implementation '],
    mustFix: [' add regression test '],
    notes: [],
  })

  assert.deepEqual(report, {
    decision: 'changes_requested',
    summary: ['reviewed current implementation'],
    mustFix: ['add regression test'],
    notes: [],
  })

  const rendered = renderReviewReport(report)
  assert.match(rendered, /## Summary/)
  assert.match(rendered, /- add regression test/)
  assert.match(rendered, /## Notes\n\nNone\./)
})

test('rejects invalid reviewer decision combinations', () => {
  assert.throws(
    () => normalizeReviewReport({ decision: 'wat', summary: ['x'], mustFix: [], notes: [] }),
    /decision must be changes_requested or approved/,
  )
  assert.throws(
    () => normalizeReviewReport({ decision: 'changes_requested', summary: ['x'], mustFix: [], notes: [] }),
    /at least one mustFix/,
  )
  assert.throws(
    () => normalizeReviewReport({ decision: 'approved', summary: ['x'], mustFix: ['fix'], notes: [] }),
    /must not contain mustFix/,
  )
  assert.throws(
    () => normalizeReviewReport({ decision: 'approved', summary: [], mustFix: [], notes: [] }),
    /summary must contain at least one item/,
  )
})

test('publishes changes requested against the current implementation result', () => {
  const posted: HandoffPacket[] = []
  const report: ReviewReport = {
    decision: 'changes_requested',
    summary: ['The implementation needs one regression fix.'],
    mustFix: ['Cover the stale-head case.'],
    notes: [],
  }

  const output = reviewSubmit(
    report,
    sourceWith([handoff('implementation_result', 'ready_to_review', HEAD)], posted),
  )

  assert.equal(posted.length, 1)
  assert.deepEqual(posted[0].metadata, {
    schema: 'opencode-review-bridge/v1',
    kind: 'review',
    state: 'changes_requested',
    head: HEAD,
  })
  assert.match(posted[0].body, /Cover the stale-head case/)
  assert.match(output, /Decision: changes_requested/)
  assert.match(output, /executor can pull the requested changes/i)
})

test('publishes approval against the current implementation result', () => {
  const posted: HandoffPacket[] = []
  const output = reviewSubmit(
    {
      decision: 'approved',
      summary: ['Implementation and validation look good.'],
      mustFix: [],
      notes: ['No remaining concerns.'],
    },
    sourceWith([handoff('implementation_result', 'ready_to_review', HEAD)], posted),
  )

  assert.equal(posted[0].metadata.state, 'approved')
  assert.match(output, /Decision: approved/)
  assert.match(output, /review cycle is approved/i)
})

test('rejects missing, stale, or already-consumed implementation results', () => {
  const report: ReviewReport = {
    decision: 'approved',
    summary: ['Looks good.'],
    mustFix: [],
    notes: [],
  }

  assert.throws(
    () => reviewSubmit(report, sourceWith([])),
    /No implementation result is ready for review/,
  )
  assert.throws(
    () => reviewSubmit(report, sourceWith([handoff('implementation_result', 'ready_to_review', OTHER_HEAD)])),
    /does not match PR head/,
  )
  assert.throws(
    () => reviewSubmit(report, sourceWith([handoff('review', 'changes_requested', HEAD)])),
    /expected implementation_result\/ready_to_review/,
  )
})

test('cli reads a reviewer report file and publishes it through the injected submitter', () => {
  const root = mkdtempSync(join(tmpdir(), 'orb-review-submit-'))
  const file = join(root, 'review.json')
  writeFileSync(file, JSON.stringify({
    decision: 'approved',
    summary: ['Looks good.'],
    mustFix: [],
    notes: [],
  }))

  let received: ReviewReport | null = null
  let stdout = ''
  let stderr = ''
  const io = {
    stdout: (value: string) => { stdout += value },
    stderr: (value: string) => { stderr += value },
  }

  try {
    const result = main(
      ['review-submit', '--file', file],
      io,
      () => 'unused',
      () => 'unused',
      () => ({ wrapperPath: '/tmp/orb', commandPaths: [], pathWarning: false }),
      () => 'unused',
      (report) => {
        received = report
        return 'Status: POSTED'
      },
    )

    assert.equal(result, 0)
    assert.equal(received?.decision, 'approved')
    assert.equal(stdout, 'Status: POSTED\n')
    assert.equal(stderr, '')

    stdout = ''
    assert.equal(main(['review-submit'], io), 1)
    assert.match(stderr, /review-submit requires exactly one of --file <review\.json> or --stdin/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
