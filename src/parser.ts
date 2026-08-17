import {
  HANDOFF_MARKER,
  isValidMetadata,
  normalizeMetadata,
  type HandoffPacket,
} from './protocol.ts'

const METADATA_PREFIX = `${HANDOFF_MARKER}\n\`\`\`json\n`
const METADATA_SUFFIX = '\n```'

export function parseHandoff(commentBody: string): HandoffPacket | null {
  const normalized = commentBody.replace(/\r\n/g, '\n')
  if (!normalized.startsWith(METADATA_PREFIX)) return null

  const metadataEnd = normalized.indexOf(METADATA_SUFFIX, METADATA_PREFIX.length)
  if (metadataEnd === -1) return null

  const json = normalized.slice(METADATA_PREFIX.length, metadataEnd)
  const remainder = normalized.slice(metadataEnd + METADATA_SUFFIX.length)

  let metadata: unknown
  try {
    metadata = JSON.parse(json)
  } catch {
    return null
  }

  if (!isValidMetadata(metadata)) return null

  return {
    metadata: normalizeMetadata(metadata),
    body: remainder.startsWith('\n') ? remainder.slice(1).trimEnd() : remainder.trimEnd(),
  }
}
