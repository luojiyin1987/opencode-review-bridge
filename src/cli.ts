import { pathToFileURL } from 'node:url'
import { reviewPull } from './review-pull.ts'
import {
  readImplementationReportFile,
  reviewPush,
  type ImplementationReport,
} from './review-push.ts'

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
  push: (report: ImplementationReport) => string = reviewPush,
): number {
  const [command, ...rest] = args

  if (command === 'review-pull') {
    try {
      io.stdout(`${pull()}\n`)
      return 0
    } catch (error) {
      io.stderr(`review-pull failed: ${formatError(error)}\n`)
      return 1
    }
  }

  if (command === 'review-push') {
    const file = readFileArgument(rest)
    if (!file) {
      io.stderr(`review-push requires --file <report.json>\n\n${usage()}\n`)
      return 1
    }

    try {
      const report = readImplementationReportFile(file)
      io.stdout(`${push(report)}\n`)
      return 0
    } catch (error) {
      io.stderr(`review-push failed: ${formatError(error)}\n`)
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

function readFileArgument(args: readonly string[]): string | null {
  if (args.length !== 2 || args[0] !== '--file' || args[1].trim().length === 0) {
    return null
  }

  return args[1]
}

function usage(): string {
  return [
    'Usage: opencode-review-bridge <command>',
    '',
    'Commands:',
    '  review-pull                Pull the latest actionable executor handoff from the current PR',
    '  review-push --file <path>  Publish an implementation result for the current PR head',
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
