import { spawnSync } from 'node:child_process'
import { formatHandoff, isActionable } from './formatter.ts'
import { parseHandoff } from './parser.ts'
import { isCommitSha, shaMatches, type HandoffPacket, type HandoffRole } from './protocol.ts'

const COMMENTS_PAGE_SIZE = 100
const PULL_FILES_PAGE_SIZE = 100

export interface PullRequestContext {
  repository: string
  number: number
  url: string
  head: string
}

export interface HandoffComment {
  id: number
  url: string | null
  createdAt: string
  packet: HandoffPacket
}

export type HandoffSelection =
  | { status: 'none' }
  | { status: 'ready'; comment: HandoffComment }
  | { status: 'stale'; comment: HandoffComment; currentHead: string }

export type GhRunner = (args: readonly string[], input?: string) => string

export class GitHubCommandError extends Error {
  args: readonly string[]
  stderr: string

  constructor(args: readonly string[], stderr: string, cause?: unknown) {
    super(`gh ${args.join(' ')} failed`, cause === undefined ? undefined : { cause })
    this.name = 'GitHubCommandError'
    this.args = [...args]
    this.stderr = stderr
  }
}

export const defaultGhRunner: GhRunner = (args, input) => {
  const result = spawnSync('gh', [...args], {
    encoding: 'utf8',
    input,
    shell: false,
  })

  if (result.error) {
    throw new GitHubCommandError(args, result.stderr ?? '', result.error)
  }

  if (result.status !== 0) {
    throw new GitHubCommandError(args, result.stderr ?? '')
  }

  return result.stdout ?? ''
}

export class GitHubHandoffAdapter {
  #runGh: GhRunner

  constructor(runGh: GhRunner = defaultGhRunner) {
    this.#runGh = runGh
  }

  getCurrentPullRequest(): PullRequestContext {
    const repositoryResult = this.#runJson(['repo', 'view', '--json', 'nameWithOwner'])
    const repository = readRepositoryName(repositoryResult)

    const pullRequestResult = this.#runJson([
      'pr',
      'view',
      '--json',
      'number,url,headRefOid',
    ])

    return readPullRequestContext(pullRequestResult, repository)
  }

  listHandoffs(context: PullRequestContext = this.getCurrentPullRequest()): HandoffComment[] {
    const comments: unknown[] = []

    for (let page = 1; ; page += 1) {
      const output = this.#runJson([
        'api',
        `repos/${context.repository}/issues/${context.number}/comments?per_page=${COMMENTS_PAGE_SIZE}&page=${page}`,
      ])

      if (!Array.isArray(output)) {
        throw new TypeError('Invalid comments response from gh')
      }

      comments.push(...output)
      if (output.length < COMMENTS_PAGE_SIZE) break
    }

    return readHandoffComments(comments)
  }

  listChangedFiles(context: PullRequestContext = this.getCurrentPullRequest()): string[] {
    const filenames: string[] = []

    for (let page = 1; ; page += 1) {
      const output = this.#runJson([
        'api',
        `repos/${context.repository}/pulls/${context.number}/files?per_page=${PULL_FILES_PAGE_SIZE}&page=${page}`,
      ])

      if (!Array.isArray(output)) {
        throw new TypeError('Invalid pull request files response from gh')
      }

      for (const entry of output) {
        if (
          !isRecord(entry)
          || typeof entry.filename !== 'string'
          || entry.filename.length === 0
          || entry.filename.includes('\n')
          || entry.filename.includes('\r')
        ) {
          throw new TypeError('Invalid pull request file from gh')
        }
        filenames.push(entry.filename)
      }

      if (output.length < PULL_FILES_PAGE_SIZE) break
    }

    return filenames
  }

  getLatestHandoff(
    role: HandoffRole,
    context: PullRequestContext = this.getCurrentPullRequest(),
  ): HandoffSelection {
    return selectLatestHandoff(this.listHandoffs(context), role, context.head)
  }

  postHandoff(
    packet: HandoffPacket,
    context: PullRequestContext = this.getCurrentPullRequest(),
  ): HandoffComment {
    const body = formatHandoff(packet)
    const output = this.#runJson(
      [
        'api',
        `repos/${context.repository}/issues/${context.number}/comments`,
        '--method',
        'POST',
        '--input',
        '-',
      ],
      JSON.stringify({ body }),
    )

    const comment = readIssueComment(output)
    const parsed = parseHandoff(comment.body)
    if (!parsed) {
      throw new TypeError('GitHub returned a comment that is not a valid handoff packet')
    }

    return {
      id: comment.id,
      url: comment.url,
      createdAt: comment.createdAt,
      packet: parsed,
    }
  }

  #runJson(args: readonly string[], input?: string): unknown {
    const output = this.#runGh(args, input)
    try {
      return JSON.parse(output)
    } catch (cause) {
      throw new GitHubCommandError(args, 'gh returned invalid JSON', cause)
    }
  }
}

export function selectLatestHandoff(
  comments: readonly HandoffComment[],
  role: HandoffRole,
  currentHead: string,
): HandoffSelection {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index]
    if (!isActionable(comment.packet, role)) continue

    const packetHead = comment.packet.metadata.head
    if (packetHead && !shaMatches(packetHead, currentHead)) {
      return { status: 'stale', comment, currentHead }
    }

    return { status: 'ready', comment }
  }

  return { status: 'none' }
}

function readRepositoryName(value: unknown): string {
  if (!isRecord(value) || typeof value.nameWithOwner !== 'string') {
    throw new TypeError('Invalid repository response from gh')
  }

  if (!/^[^/\s]+\/[^/\s]+$/.test(value.nameWithOwner)) {
    throw new TypeError('Invalid repository name from gh')
  }

  return value.nameWithOwner
}

function readPullRequestContext(value: unknown, repository: string): PullRequestContext {
  if (!isRecord(value)) throw new TypeError('Invalid pull request response from gh')

  const { number, url, headRefOid } = value
  if (!Number.isInteger(number) || (number as number) <= 0) {
    throw new TypeError('Invalid pull request number from gh')
  }
  if (typeof url !== 'string' || url.length === 0) {
    throw new TypeError('Invalid pull request URL from gh')
  }
  if (!isCommitSha(headRefOid)) {
    throw new TypeError('Invalid pull request head SHA from gh')
  }

  return { repository, number: number as number, url, head: headRefOid }
}

function readHandoffComments(value: unknown): HandoffComment[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Invalid comments response from gh')
  }

  const entries = value.every(Array.isArray) ? value.flat() : value
  const handoffs: HandoffComment[] = []

  for (const entry of entries) {
    const comment = tryReadIssueComment(entry)
    if (!comment) continue

    const packet = parseHandoff(comment.body)
    if (!packet) continue

    handoffs.push({
      id: comment.id,
      url: comment.url,
      createdAt: comment.createdAt,
      packet,
    })
  }

  handoffs.sort((left, right) => {
    const byTime = left.createdAt.localeCompare(right.createdAt)
    return byTime !== 0 ? byTime : left.id - right.id
  })

  return handoffs
}

interface IssueComment {
  id: number
  body: string
  createdAt: string
  url: string | null
}

function readIssueComment(value: unknown): IssueComment {
  const comment = tryReadIssueComment(value)
  if (!comment) throw new TypeError('Invalid comment response from gh')
  return comment
}

function tryReadIssueComment(value: unknown): IssueComment | null {
  if (!isRecord(value)) return null
  if (!Number.isInteger(value.id) || (value.id as number) <= 0) return null
  if (typeof value.body !== 'string') return null
  if (typeof value.created_at !== 'string' || value.created_at.length === 0) return null
  if (value.html_url !== undefined && value.html_url !== null && typeof value.html_url !== 'string') {
    return null
  }

  return {
    id: value.id as number,
    body: value.body,
    createdAt: value.created_at,
    url: typeof value.html_url === 'string' ? value.html_url : null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
