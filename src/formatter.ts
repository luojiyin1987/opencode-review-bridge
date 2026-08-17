import {
  HANDOFF_MARKER,
  isValidMetadata,
  normalizeMetadata,
  shaMatches,
  type HandoffPacket,
  type HandoffRole,
} from './protocol.ts'

export function formatHandoff(packet: HandoffPacket): string {
  if (!isValidMetadata(packet.metadata)) {
    throw new TypeError('Invalid handoff metadata')
  }

  const metadata = JSON.stringify(normalizeMetadata(packet.metadata), null, 2)
  const body = packet.body.trim()

  return [
    HANDOFF_MARKER,
    '```json',
    metadata,
    '```',
    body,
  ].filter((part, index) => part.length > 0 || index < 4).join('\n')
}

export function isActionable(
  packet: HandoffPacket,
  role: HandoffRole,
  currentHead?: string | null,
): boolean {
  if (!isValidMetadata(packet.metadata)) return false

  const { kind, state, head } = packet.metadata

  if (currentHead && head && !shaMatches(head, currentHead)) {
    return false
  }

  if (role === 'executor') {
    return (
      (kind === 'plan' && state === 'ready_to_implement') ||
      (kind === 'review' && state === 'changes_requested')
    )
  }

  return kind === 'implementation_result' && state === 'ready_to_review'
}
