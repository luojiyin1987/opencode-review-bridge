import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function command(name: string): string {
  return readFileSync(new URL(`../.opencode/commands/${name}.md`, import.meta.url), 'utf8')
}

test('review-pull command stops at the executor boundary', () => {
  const content = command('review-pull')

  assert.match(content, /authorizes executor work only/i)
  assert.match(content, /Do not run `\/review-push`/)
  assert.match(content, /`review-submit`/)
  assert.match(content, /wait for an explicit user command/i)
})

test('review-push command stops before reviewer actions', () => {
  const content = command('review-push')

  assert.match(content, /executor-only command/i)
  assert.match(content, /show the PR\/comment receipt to the user and stop/i)
  assert.match(content, /Do not invoke `review-submit`/)
  assert.match(content, /do not publish `approved` or `changes_requested`/i)
})
