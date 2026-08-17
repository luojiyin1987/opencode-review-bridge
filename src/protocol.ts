export const HANDOFF_MARKER = '<!-- opencode-review-bridge:v1 -->' as const
export const HANDOFF_SCHEMA = 'opencode-review-bridge/v1' as const

export const HANDOFF_KINDS = [
  'plan',
  'review',
  'implementation_result',
] as const

export const HANDOFF_STATES = [
  'ready_to_implement',
  'implementing',
  'ready_to_review',
  'changes_requested',
  'approved',
] as const

export type HandoffKind = (typeof HANDOFF_KINDS)[number]
export type HandoffState = (typeof HANDOFF_STATES)[number]
export type HandoffRole = 'executor' | 'reviewer'

export interface HandoffMetadata {
  schema: typeof HANDOFF_SCHEMA
  kind: HandoffKind
  state: HandoffState
  head: string | null
}

export interface HandoffPacket {
  metadata: HandoffMetadata
  body: string
}

const KIND_STATES: Record<HandoffKind, readonly HandoffState[]> = {
  plan: ['ready_to_implement'],
  review: ['changes_requested', 'approved'],
  implementation_result: ['ready_to_review'],
}

export function isHandoffKind(value: unknown): value is HandoffKind {
  return typeof value === 'string' && HANDOFF_KINDS.includes(value as HandoffKind)
}

export function isHandoffState(value: unknown): value is HandoffState {
  return typeof value === 'string' && HANDOFF_STATES.includes(value as HandoffState)
}

export function isCommitSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{7,40}$/i.test(value)
}

export function isValidMetadata(value: unknown): value is HandoffMetadata {
  if (!isRecord(value)) return false
  if (value.schema !== HANDOFF_SCHEMA) return false
  if (!isHandoffKind(value.kind) || !isHandoffState(value.state)) return false
  if (!KIND_STATES[value.kind].includes(value.state)) return false

  if (value.kind === 'plan') {
    return value.head === null || isCommitSha(value.head)
  }

  return isCommitSha(value.head)
}

export function normalizeMetadata(value: HandoffMetadata): HandoffMetadata {
  return {
    schema: HANDOFF_SCHEMA,
    kind: value.kind,
    state: value.state,
    head: value.head,
  }
}

export function shaMatches(packetHead: string, currentHead: string): boolean {
  const packet = packetHead.toLowerCase()
  const current = currentHead.toLowerCase()

  if (!isCommitSha(packet) || !isCommitSha(current)) return false
  return packet === current || packet.startsWith(current) || current.startsWith(packet)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
