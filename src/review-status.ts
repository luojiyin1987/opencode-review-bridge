import { GitHubHandoffAdapter, type HandoffComment, type PullRequestContext } from './github.ts'
import { shaMatches, type HandoffState } from './protocol.ts'

export interface ReviewStatusSource {
  getCurrentPullRequest(): PullRequestContext
  listHandoffs(context: PullRequestContext): HandoffComment[]
}

export function reviewStatus(
  source: ReviewStatusSource = new GitHubHandoffAdapter(),
): string {
  const context = source.getCurrentPullRequest()
  const handoffs = source.listHandoffs(context)
  return renderReviewStatus(context, handoffs)
}

export function renderReviewStatus(
  context: PullRequestContext,
  handoffs: readonly HandoffComment[],
): string {
  const latest = handoffs.at(-1)

  if (!latest) {
    return [
      '# Review bridge status',
      '',
      `PR: ${context.url}`,
      `Head: ${context.head}`,
      'Handoff: NONE',
      '',
      'Next: Await a valid v1 handoff on this pull request.',
    ].join('\n')
  }

  const { metadata } = latest.packet
  const revision = metadata.head === null
    ? 'UNBOUND'
    : shaMatches(metadata.head, context.head)
      ? 'CURRENT'
      : 'STALE'

  return [
    '# Review bridge status',
    '',
    `PR: ${context.url}`,
    `Head: ${context.head}`,
    'Handoff: FOUND',
    `Kind: ${metadata.kind}`,
    `State: ${metadata.state}`,
    `Revision: ${revision}`,
    `Handoff head: ${metadata.head ?? '(unbound)'}`,
    `Source: ${latest.url ?? `comment #${latest.id}`}`,
    '',
    `Next: ${nextAction(metadata.state, revision)}`,
  ].join('\n')
}

function nextAction(state: HandoffState, revision: 'CURRENT' | 'STALE' | 'UNBOUND'): string {
  if (revision === 'STALE') {
    return 'Refresh the latest handoff for the current PR head before acting.'
  }

  if (state === 'ready_to_implement' || state === 'changes_requested') {
    return 'Executor can run /review-pull.'
  }

  if (state === 'ready_to_review') {
    return 'Reviewer should inspect the current PR head.'
  }

  if (state === 'approved') {
    return 'Review cycle is complete for this handoff.'
  }

  return 'Wait for the next handoff.'
}
