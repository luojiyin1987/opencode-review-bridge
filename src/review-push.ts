import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import {
  GitHubHandoffAdapter,
  type HandoffComment,
  type PullRequestContext,
} from './github.ts'
import { isCommitSha, shaMatches, type HandoffPacket } from './protocol.ts'

export interface ImplementationReport {
  addressed: string[]
  validation: string[]
  remainingConcerns: string[]
}

export interface ReviewPushSource {
  getCurrentPullRequest(): PullRequestContext
  listChangedFiles(context: PullRequestContext): string[]
  postHandoff(packet: HandoffPacket, context: PullRequestContext): HandoffComment
}

export interface WorkspaceState {
  head: string
  clean: boolean
}

export interface ReviewPushWorkspace {
  getState(): WorkspaceState
}

export type GitRunner = (args: readonly string[]) => string

export class GitCommandError extends Error {
  args: readonly string[]
  stderr: string

  constructor(args: readonly string[], stderr: string, cause?: unknown) {
    super(`git ${args.join(' ')} failed`, cause === undefined ? undefined : { cause })
    this.name = 'GitCommandError'
    this.args = [...args]
    this.stderr = stderr
  }
}

export const defaultGitRunner: GitRunner = (args) => {
  const result = spawnSync('git', [...args], {
    encoding: 'utf8',
    shell: false,
  })

  if (result.error) {
    throw new GitCommandError(args, result.stderr ?? '', result.error)
  }

  if (result.status !== 0) {
    throw new GitCommandError(args, result.stderr ?? '')
  }

  return result.stdout ?? ''
}

export class GitWorkspace implements ReviewPushWorkspace {
  #runGit: GitRunner

  constructor(runGit: GitRunner = defaultGitRunner) {
    this.#runGit = runGit
  }

  getState(): WorkspaceState {
    const head = this.#runGit(['rev-parse', 'HEAD']).trim()
    if (!isCommitSha(head)) {
      throw new TypeError('Invalid local HEAD from git')
    }

    const status = this.#runGit(['status', '--porcelain=v1', '--untracked-files=all'])
    return {
      head,
      clean: status.trim().length === 0,
    }
  }
}

export function reviewPush(
  report: ImplementationReport,
  source: ReviewPushSource = new GitHubHandoffAdapter(),
  workspace: ReviewPushWorkspace = new GitWorkspace(),
): string {
  const normalized = normalizeImplementationReport(report)
  const context = source.getCurrentPullRequest()
  const local = workspace.getState()

  if (!local.clean) {
    throw new Error('Working tree is not clean; commit or discard local changes before publishing a review handoff')
  }

  if (!shaMatches(local.head, context.head)) {
    throw new Error(`Local HEAD ${local.head} does not match PR head ${context.head}; push the intended commit before publishing`)
  }

  const changedFiles = source.listChangedFiles(context)
  const packet: HandoffPacket = {
    metadata: {
      schema: 'opencode-review-bridge/v1',
      kind: 'implementation_result',
      state: 'ready_to_review',
      head: context.head,
    },
    body: renderImplementationReport(normalized, changedFiles),
  }

  const comment = source.postHandoff(packet, context)
  const url = comment.url ?? `comment #${comment.id}`

  return [
    '# Review result',
    '',
    'Status: POSTED',
    `PR: ${context.url}`,
    `Head: ${context.head}`,
    `Comment: ${url}`,
    '',
    'The implementation result is ready for reviewer inspection.',
  ].join('\n')
}

export function renderImplementationReport(
  report: ImplementationReport,
  changedFiles: readonly string[],
): string {
  const normalized = normalizeImplementationReport(report)
  const changed = normalizeItems(changedFiles, 'changedFiles')

  return [
    '## Addressed',
    '',
    renderList(normalized.addressed),
    '',
    '## Validation',
    '',
    renderList(normalized.validation),
    '',
    '## Changed',
    '',
    renderList(changed),
    '',
    '## Remaining concerns',
    '',
    renderList(normalized.remainingConcerns),
  ].join('\n')
}

export function readImplementationReportFile(path: string): ImplementationReport {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new TypeError(`Could not read implementation report from ${path}`, { cause })
  }

  return normalizeImplementationReport(value)
}

export function normalizeImplementationReport(value: unknown): ImplementationReport {
  if (!isRecord(value)) {
    throw new TypeError('Implementation report must be a JSON object')
  }

  return {
    addressed: normalizeItems(value.addressed, 'addressed'),
    validation: normalizeItems(value.validation, 'validation'),
    remainingConcerns: normalizeItems(value.remainingConcerns, 'remainingConcerns'),
  }
}

function normalizeItems(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Implementation report field ${field} must be an array`)
  }

  if (value.length > 100) {
    throw new TypeError(`Implementation report field ${field} has too many items`)
  }

  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new TypeError(`Implementation report field ${field}[${index}] must be a string`)
    }

    const normalized = item.trim()
    if (normalized.length === 0 || normalized.length > 2000 || normalized.includes('\n') || normalized.includes('\r')) {
      throw new TypeError(`Implementation report field ${field}[${index}] must be a non-empty single-line string up to 2000 characters`)
    }

    return normalized
  })
}

function renderList(items: readonly string[]): string {
  return items.length === 0 ? 'None.' : items.map((item) => `- ${item}`).join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
