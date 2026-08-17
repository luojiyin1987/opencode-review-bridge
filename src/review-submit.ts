import { readFileSync } from 'node:fs'

import {
  GitHubHandoffAdapter,
  type HandoffComment,
  type PullRequestContext,
} from './github.ts'
import { shaMatches, type HandoffPacket } from './protocol.ts'

export type ReviewDecision = 'changes_requested' | 'approved'

export interface ReviewReport {
  decision: ReviewDecision
  summary: string[]
  mustFix: string[]
  notes: string[]
}

export interface ReviewSubmitSource {
  getCurrentPullRequest(): PullRequestContext
  listHandoffs(context: PullRequestContext): HandoffComment[]
  postHandoff(packet: HandoffPacket, context: PullRequestContext): HandoffComment
}

export function reviewSubmit(
  report: ReviewReport,
  source: ReviewSubmitSource = new GitHubHandoffAdapter(),
): string {
  const normalized = normalizeReviewReport(report)
  const context = source.getCurrentPullRequest()
  const latest = source.listHandoffs(context).at(-1)

  if (!latest) {
    throw new Error('No implementation result is ready for review on the current pull request')
  }

  const metadata = latest.packet.metadata
  if (metadata.head !== null && !shaMatches(metadata.head, context.head)) {
    throw new Error(`Latest handoff head ${metadata.head} does not match PR head ${context.head}; refresh the handoff before reviewing`)
  }

  if (metadata.kind !== 'implementation_result' || metadata.state !== 'ready_to_review') {
    throw new Error(`Latest handoff is ${metadata.kind}/${metadata.state}; expected implementation_result/ready_to_review before submitting a review`)
  }

  const packet: HandoffPacket = {
    metadata: {
      schema: 'opencode-review-bridge/v1',
      kind: 'review',
      state: normalized.decision,
      head: context.head,
    },
    body: renderReviewReport(normalized),
  }

  const comment = source.postHandoff(packet, context)
  const url = comment.url ?? `comment #${comment.id}`

  return [
    '# Reviewer handoff',
    '',
    'Status: POSTED',
    `Decision: ${normalized.decision}`,
    `PR: ${context.url}`,
    `Head: ${context.head}`,
    `Comment: ${url}`,
    '',
    normalized.decision === 'changes_requested'
      ? 'The executor can pull the requested changes from this PR.'
      : 'The current bridge review cycle is approved for this PR head.',
  ].join('\n')
}

export function renderReviewReport(report: ReviewReport): string {
  const normalized = normalizeReviewReport(report)

  return [
    '## Summary',
    '',
    renderList(normalized.summary),
    '',
    '## Must fix',
    '',
    renderList(normalized.mustFix),
    '',
    '## Notes',
    '',
    renderList(normalized.notes),
  ].join('\n')
}

export function readReviewReportFile(path: string): ReviewReport {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new TypeError(`Could not read reviewer report from ${path}`, { cause })
  }

  return normalizeReviewReport(value)
}

export function normalizeReviewReport(value: unknown): ReviewReport {
  if (!isRecord(value)) {
    throw new TypeError('Reviewer report must be a JSON object')
  }

  if (value.decision !== 'changes_requested' && value.decision !== 'approved') {
    throw new TypeError('Reviewer report decision must be changes_requested or approved')
  }

  const report: ReviewReport = {
    decision: value.decision,
    summary: normalizeItems(value.summary, 'summary'),
    mustFix: normalizeItems(value.mustFix, 'mustFix'),
    notes: normalizeItems(value.notes, 'notes'),
  }

  if (report.summary.length === 0) {
    throw new TypeError('Reviewer report summary must contain at least one item')
  }

  if (report.decision === 'changes_requested' && report.mustFix.length === 0) {
    throw new TypeError('changes_requested reviewer reports must contain at least one mustFix item')
  }

  if (report.decision === 'approved' && report.mustFix.length > 0) {
    throw new TypeError('approved reviewer reports must not contain mustFix items')
  }

  return report
}

function normalizeItems(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Reviewer report field ${field} must be an array`)
  }

  if (value.length > 100) {
    throw new TypeError(`Reviewer report field ${field} has too many items`)
  }

  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new TypeError(`Reviewer report field ${field}[${index}] must be a string`)
    }

    const normalized = item.trim()
    if (normalized.length === 0 || normalized.length > 2000 || normalized.includes('\n') || normalized.includes('\r')) {
      throw new TypeError(`Reviewer report field ${field}[${index}] must be a non-empty single-line string up to 2000 characters`)
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
