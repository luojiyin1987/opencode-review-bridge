import { pathToFileURL } from 'node:url'
import { installGlobal, renderInstallResult, type InstallResult } from './install.ts'
import { reviewPull } from './review-pull.ts'
import {
  readImplementationReportFile,
  reviewPush,
  type ImplementationReport,
} from './review-push.ts'
import { reviewStatus } from './review-status.ts'
import {
  readReviewReportFile,
  reviewSubmit,
  type ReviewReport,
} from './review-submit.ts'

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
  install: () => InstallResult = installGlobal,
  status: () => string = reviewStatus,
  submit: (report: ReviewReport) => string = reviewSubmit,
): number {
  const [command, ...rest] = args

  if (command === 'install') {
    if (rest.length > 0) {
      io.stderr(`install does not accept arguments\n\n${usage()}\n`)
      return 1
    }

    try {
      io.stdout(`${renderInstallResult(install())}\n`)
      return 0
    } catch (error) {
      io.stderr(`install failed: ${formatError(error)}\n`)
      return 1
    }
  }

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

  if (command === 'review-status') {
    if (rest.length > 0) {
      io.stderr(`review-status does not accept arguments\n\n${usage()}\n`)
      return 1
    }

    try {
      io.stdout(`${status()}\n`)
      return 0
    } catch (error) {
      io.stderr(`review-status failed: ${formatError(error)}\n`)
      return 1
    }
  }

  if (command === 'review-submit') {
    const file = readFileArgument(rest)
    if (!file) {
      io.stderr(`review-submit requires --file <review.json>\n\n${usage()}\n`)
      return 1
    }

    try {
      const report = readReviewReportFile(file)
      io.stdout(`${submit(report)}\n`)
      return 0
    } catch (error) {
      io.stderr(`review-submit failed: ${formatError(error)}\n`)
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
    '  install                     Install the CLI wrapper and global OpenCode commands',
    '  review-pull                 Pull the latest actionable executor handoff from the current PR',
    '  review-push --file <path>   Publish an implementation result for the current PR head',
    '  review-status               Show the latest bridge handoff state for the current PR',
    '  review-submit --file <path> Publish a reviewer decision for a ready implementation result',
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
