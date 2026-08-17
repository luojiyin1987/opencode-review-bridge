import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { GitHubCommandError } from './github.ts'
import { installGlobal, renderInstallResult, type InstallResult } from './install.ts'
import { reviewPull } from './review-pull.ts'
import {
  readImplementationReportFile,
  reviewPush,
  type ImplementationReport,
} from './review-push.ts'
import { reviewStatus } from './review-status.ts'
import {
  normalizeReviewReport,
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
  readStdin: () => string = defaultReadStdin,
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
    const input = readReviewSubmitInput(rest)
    if (!input) {
      io.stderr(`review-submit requires exactly one of --file <review.json> or --stdin\n\n${usage()}\n`)
      return 1
    }

    try {
      const report = input.kind === 'file'
        ? readReviewReportFile(input.path)
        : readReviewReportStdin(readStdin)
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

function readReviewSubmitInput(
  args: readonly string[],
): { kind: 'file'; path: string } | { kind: 'stdin' } | null {
  if (args.length === 1 && args[0] === '--stdin') {
    return { kind: 'stdin' }
  }

  const file = readFileArgument(args)
  return file ? { kind: 'file', path: file } : null
}

function readReviewReportStdin(readStdin: () => string): ReviewReport {
  const input = readStdin()
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch (cause) {
    throw new TypeError('Could not parse reviewer report from stdin', { cause })
  }

  return normalizeReviewReport(value)
}

function defaultReadStdin(): string {
  if (process.stdin.isTTY) {
    throw new Error('review-submit --stdin requires piped JSON input')
  }

  return readFileSync(0, 'utf8')
}

function usage(): string {
  return [
    'Usage: opencode-review-bridge <command>',
    '',
    'Commands:',
    '  install                                Install the CLI wrapper and global OpenCode commands',
    '  review-pull                            Pull the latest actionable executor handoff from the current PR',
    '  review-push --file <path>              Publish an implementation result for the current PR head',
    '  review-status                          Show the latest bridge handoff state for the current PR',
    '  review-submit (--file <path> | --stdin) Publish a reviewer decision for a ready implementation result',
  ].join('\n')
}

function formatError(error: unknown): string {
  if (error instanceof GitHubCommandError) {
    const stderr = error.stderr.trim()
    return stderr.length > 0 ? `${error.message}: ${stderr}` : error.message
  }

  return error instanceof Error ? error.message : String(error)
}

function isMainModule(): boolean {
  const entry = process.argv[1]
  return typeof entry === 'string' && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  process.exitCode = main()
}
