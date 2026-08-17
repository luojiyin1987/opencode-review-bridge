import { pathToFileURL } from 'node:url'
import { reviewPull } from './review-pull.ts'

export interface CliIo {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

const defaultIo: CliIo = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
}

export function main(
  args: readonly string[] = process.argv.slice(2),
  io: CliIo = defaultIo,
  pull: () => string = reviewPull,
): number {
  const [command] = args

  if (command === 'review-pull') {
    try {
      io.stdout(`${pull()}\n`)
      return 0
    } catch (error) {
      io.stderr(`review-pull failed: ${formatError(error)}\n`)
      return 1
    }
  }

  if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
    io.stdout(`${usage()}\n`)
    return 0
  }

  io.stderr(`Unknown command: ${command}\n\n${usage()}\n`)
  return 1
}

function usage(): string {
  return [
    'Usage: opencode-review-bridge <command>',
    '',
    'Commands:',
    '  review-pull  Pull the latest actionable executor handoff from the current PR',
  ].join('\n')
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isMainModule(): boolean {
  const entry = process.argv[1]
  return typeof entry === 'string' && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  process.exitCode = main()
}
