import assert from 'node:assert/strict'
import test from 'node:test'

import { main, type CliIo } from '../src/cli.ts'
import { GitHubCommandError } from '../src/github.ts'

function captureIo(): { io: CliIo; read: () => { stdout: string; stderr: string } } {
  let stdout = ''
  let stderr = ''

  return {
    io: {
      stdout: (value) => { stdout += value },
      stderr: (value) => { stderr += value },
    },
    read: () => ({ stdout, stderr }),
  }
}

function runStatusError(error: unknown): { result: number; stdout: string; stderr: string } {
  const captured = captureIo()
  const result = main(
    ['review-status'],
    captured.io,
    () => 'unused',
    () => 'unused',
    () => ({ wrapperPath: '/tmp/opencode-review-bridge', commandPaths: [], pathWarning: false }),
    () => { throw error },
  )

  return { result, ...captured.read() }
}

test('CLI includes GitHub CLI stderr in command failures', () => {
  const error = new GitHubCommandError(
    ['api', 'repos/owner/repo/issues/9/comments?per_page=100&page=1'],
    'HTTP 502: Bad Gateway\n',
  )

  const output = runStatusError(error)

  assert.equal(output.result, 1)
  assert.equal(output.stdout, '')
  assert.equal(
    output.stderr,
    'review-status failed: gh api repos/owner/repo/issues/9/comments?per_page=100&page=1 failed: HTTP 502: Bad Gateway\n',
  )
})

test('CLI does not add an empty stderr suffix to GitHub command failures', () => {
  const output = runStatusError(new GitHubCommandError(['pr', 'view'], '   \n'))

  assert.equal(output.result, 1)
  assert.equal(output.stderr, 'review-status failed: gh pr view failed\n')
})

test('CLI keeps generic error formatting unchanged', () => {
  const output = runStatusError(new Error('boom'))

  assert.equal(output.result, 1)
  assert.equal(output.stderr, 'review-status failed: boom\n')
})
