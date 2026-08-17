import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GitHubCommandError,
  GitHubHandoffAdapter,
  formatHandoff,
  selectLatestHandoff,
  type GhRunner,
  type HandoffComment,
  type HandoffPacket,
  type PullRequestContext,
} from '../src/index.ts'

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER_HEAD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const CONTEXT: PullRequestContext = {
  repository: 'owner/repo',
  number: 12,
  url: 'https://github.com/owner/repo/pull/12',
  head: HEAD,
}

function packet(
  kind: HandoffPacket['metadata']['kind'],
  state: HandoffPacket['metadata']['state'],
  head: string | null,
  body = 'body',
): HandoffPacket {
  return {
    metadata: {
      schema: 'opencode-review-bridge/v1',
      kind,
      state,
      head,
    },
    body,
  }
}

function comment(
  id: number,
  createdAt: string,
  value: HandoffPacket,
): HandoffComment {
  return {
    id,
    url: `https://github.com/owner/repo/issues/comments/${id}`,
    createdAt,
    packet: value,
  }
}

test('discovers the current repository and pull request', () => {
  const calls: string[][] = []
  const runner: GhRunner = (args) => {
    calls.push([...args])
    if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: 'owner/repo' })
    return JSON.stringify({
      number: 12,
      url: 'https://github.com/owner/repo/pull/12',
      headRefOid: HEAD,
    })
  }

  const adapter = new GitHubHandoffAdapter(runner)
  assert.deepEqual(adapter.getCurrentPullRequest(), CONTEXT)
  assert.deepEqual(calls, [
    ['repo', 'view', '--json', 'nameWithOwner'],
    ['pr', 'view', '--json', 'number,url,headRefOid'],
  ])
})

test('lists valid handoffs from paginated issue comments in chronological order', () => {
  const newer = packet('review', 'changes_requested', HEAD, 'fix this')
  const older = packet('plan', 'ready_to_implement', null, 'do this')

  const runner: GhRunner = (args) => {
    assert.deepEqual(args, [
      'api',
      '--paginate',
      '--slurp',
      'repos/owner/repo/issues/12/comments?per_page=100',
    ])

    return JSON.stringify([
      [
        {
          id: 3,
          body: formatHandoff(newer),
          created_at: '2026-08-17T07:03:00Z',
          html_url: 'https://example.test/3',
        },
        {
          id: 2,
          body: 'ordinary PR discussion',
          created_at: '2026-08-17T07:02:00Z',
          html_url: 'https://example.test/2',
        },
      ],
      [
        {
          id: 1,
          body: formatHandoff(older),
          created_at: '2026-08-17T07:01:00Z',
          html_url: 'https://example.test/1',
        },
      ],
    ])
  }

  const adapter = new GitHubHandoffAdapter(runner)
  const handoffs = adapter.listHandoffs(CONTEXT)

  assert.deepEqual(handoffs.map((item) => item.id), [1, 3])
  assert.deepEqual(handoffs.map((item) => item.packet.body), ['do this', 'fix this'])
})

test('selects the newest role-relevant handoff', () => {
  const comments = [
    comment(1, '2026-08-17T07:01:00Z', packet('plan', 'ready_to_implement', null)),
    comment(2, '2026-08-17T07:02:00Z', packet('implementation_result', 'ready_to_review', HEAD)),
    comment(3, '2026-08-17T07:03:00Z', packet('review', 'changes_requested', HEAD)),
  ]

  const selection = selectLatestHandoff(comments, 'executor', HEAD)
  assert.equal(selection.status, 'ready')
  if (selection.status === 'ready') assert.equal(selection.comment.id, 3)
})

test('surfaces a stale newest handoff instead of falling back to an older plan', () => {
  const comments = [
    comment(1, '2026-08-17T07:01:00Z', packet('plan', 'ready_to_implement', null)),
    comment(2, '2026-08-17T07:02:00Z', packet('review', 'changes_requested', OTHER_HEAD)),
  ]

  const selection = selectLatestHandoff(comments, 'executor', HEAD)
  assert.equal(selection.status, 'stale')
  if (selection.status === 'stale') {
    assert.equal(selection.comment.id, 2)
    assert.equal(selection.currentHead, HEAD)
  }
})

test('returns none when there is no handoff for the requested role', () => {
  const comments = [
    comment(1, '2026-08-17T07:01:00Z', packet('review', 'approved', HEAD)),
  ]

  assert.deepEqual(selectLatestHandoff(comments, 'executor', HEAD), { status: 'none' })
  assert.deepEqual(selectLatestHandoff(comments, 'reviewer', HEAD), { status: 'none' })
})

test('posts handoffs through gh api using stdin JSON', () => {
  const value = packet('implementation_result', 'ready_to_review', HEAD, 'done')
  let receivedInput: string | undefined

  const runner: GhRunner = (args, input) => {
    assert.deepEqual(args, [
      'api',
      'repos/owner/repo/issues/12/comments',
      '--method',
      'POST',
      '--input',
      '-',
    ])
    receivedInput = input
    const request = JSON.parse(input ?? '{}')
    return JSON.stringify({
      id: 44,
      body: request.body,
      created_at: '2026-08-17T07:04:00Z',
      html_url: 'https://example.test/44',
    })
  }

  const posted = new GitHubHandoffAdapter(runner).postHandoff(value, CONTEXT)
  assert.equal(posted.id, 44)
  assert.deepEqual(posted.packet, value)
  assert.deepEqual(JSON.parse(receivedInput ?? '{}'), { body: formatHandoff(value) })
})

test('reports invalid gh JSON as a GitHub command error', () => {
  const adapter = new GitHubHandoffAdapter(() => 'not json')
  assert.throws(() => adapter.getCurrentPullRequest(), GitHubCommandError)
})
