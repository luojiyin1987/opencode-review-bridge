import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GitHubCommandError,
  GitHubHandoffAdapter,
  type GhRunner,
  type HandoffPacket,
  type PullRequestContext,
} from '../src/index.ts'

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const CONTEXT: PullRequestContext = {
  repository: 'owner/repo',
  number: 12,
  url: 'https://github.com/owner/repo/pull/12',
  head: HEAD,
}

function eofError(args: readonly string[], method = 'Get'): GitHubCommandError {
  return new GitHubCommandError(args, `${method} "https://api.github.com/example": EOF`)
}

test('retries transient repository discovery and succeeds', () => {
  let repositoryAttempts = 0
  const calls: string[][] = []

  const runner: GhRunner = (args) => {
    calls.push([...args])
    if (args[0] === 'repo') {
      repositoryAttempts += 1
      if (repositoryAttempts === 1) throw eofError(args, 'Post')
      return JSON.stringify({ nameWithOwner: 'owner/repo' })
    }

    return JSON.stringify({
      number: 12,
      url: 'https://github.com/owner/repo/pull/12',
      headRefOid: HEAD,
    })
  }

  const context = new GitHubHandoffAdapter(runner).getCurrentPullRequest()

  assert.deepEqual(context, CONTEXT)
  assert.equal(repositoryAttempts, 2)
  assert.deepEqual(calls, [
    ['repo', 'view', '--json', 'nameWithOwner'],
    ['repo', 'view', '--json', 'nameWithOwner'],
    ['pr', 'view', '--json', 'number,url,headRefOid'],
  ])
})

test('retries transient pull request files reads and succeeds', () => {
  let attempts = 0
  const runner: GhRunner = (args) => {
    attempts += 1
    if (attempts === 1) throw eofError(args)
    return JSON.stringify([{ filename: 'README.md' }])
  }

  const files = new GitHubHandoffAdapter(runner).listChangedFiles(CONTEXT)

  assert.deepEqual(files, ['README.md'])
  assert.equal(attempts, 2)
})

test('stops retrying transient reads after three attempts and preserves the first error', () => {
  let attempts = 0
  const errors: GitHubCommandError[] = []

  const runner: GhRunner = (args) => {
    attempts += 1
    const error = new GitHubCommandError(
      args,
      `Get "https://api.github.com/example": EOF attempt ${attempts}`,
    )
    errors.push(error)
    throw error
  }

  assert.throws(
    () => new GitHubHandoffAdapter(runner).listHandoffs(CONTEXT),
    (error: unknown) => error === errors[0],
  )
  assert.equal(attempts, 3)
  assert.equal(errors.length, 3)
  assert.notEqual(errors[0], errors[1])
  assert.notEqual(errors[1], errors[2])
})

test('does not retry non-transient read failures', () => {
  let attempts = 0
  const runner: GhRunner = (args) => {
    attempts += 1
    throw new GitHubCommandError(args, 'HTTP 401: Bad credentials')
  }

  assert.throws(
    () => new GitHubHandoffAdapter(runner).listChangedFiles(CONTEXT),
    GitHubCommandError,
  )
  assert.equal(attempts, 1)
})

test('never retries handoff posts after a transient failure', () => {
  let attempts = 0
  const value: HandoffPacket = {
    metadata: {
      schema: 'opencode-review-bridge/v1',
      kind: 'implementation_result',
      state: 'ready_to_review',
      head: HEAD,
    },
    body: 'done',
  }
  const runner: GhRunner = (args) => {
    attempts += 1
    throw eofError(args, 'Post')
  }

  assert.throws(
    () => new GitHubHandoffAdapter(runner).postHandoff(value, CONTEXT),
    GitHubCommandError,
  )
  assert.equal(attempts, 1)
})
