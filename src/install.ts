import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MANAGED_COMMAND_MARKER = '<!-- opencode-review-bridge:managed-command -->'
const MANAGED_WRAPPER_MARKER = '# opencode-review-bridge managed wrapper'
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_SOURCE_ROOT = resolve(CURRENT_DIR, '..')

export interface InstallOptions {
  home?: string
  path?: string
  sourceRoot?: string
}

export interface InstallResult {
  wrapperPath: string
  commandPaths: string[]
  pathWarning: boolean
}

export class InstallConflictError extends Error {
  path: string

  constructor(path: string) {
    super(`Refusing to overwrite unmanaged file: ${path}`)
    this.name = 'InstallConflictError'
    this.path = path
  }
}

export function installGlobal(options: InstallOptions = {}): InstallResult {
  const home = options.home ?? homedir()
  const sourceRoot = options.sourceRoot ?? DEFAULT_SOURCE_ROOT
  const binDir = join(home, '.local', 'bin')
  const commandsDir = join(home, '.config', 'opencode', 'commands')
  const wrapperPath = join(binDir, 'opencode-review-bridge')

  mkdirSync(binDir, { recursive: true })
  mkdirSync(commandsDir, { recursive: true })

  writeManagedWrapper(wrapperPath, renderWrapper(join(sourceRoot, 'src', 'cli.ts')))

  const commandPaths = ['review-pull', 'review-push'].map((command) => {
    const templatePath = join(sourceRoot, '.opencode', 'commands', `${command}.md`)
    const outputPath = join(commandsDir, `${command}.md`)
    const content = renderGlobalCommand(readFileSync(templatePath, 'utf8'))
    writeManagedCommand(outputPath, content, command)
    return outputPath
  })

  return {
    wrapperPath,
    commandPaths,
    pathWarning: !pathContains(options.path ?? process.env.PATH ?? '', binDir),
  }
}

export function renderInstallResult(result: InstallResult): string {
  const lines = [
    'Global install complete.',
    `CLI: ${result.wrapperPath}`,
    ...result.commandPaths.map((path) => `OpenCode command: ${path}`),
  ]

  if (result.pathWarning) {
    lines.push('', `Warning: ${dirname(result.wrapperPath)} is not on PATH.`)
  }

  return lines.join('\n')
}

export function renderGlobalCommand(template: string): string {
  const rendered = template
    .replace('npm run --silent review-pull', 'opencode-review-bridge review-pull')
    .replace('npm run --silent review-push -- --file', 'opencode-review-bridge review-push --file')

  if (rendered.includes(MANAGED_COMMAND_MARKER)) return rendered
  return rendered.replace('\n---\n\n', `\n---\n\n${MANAGED_COMMAND_MARKER}\n\n`)
}

function writeManagedWrapper(path: string, content: string): void {
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8')
    const looksLikeManualBridgeWrapper =
      existing.includes('node --experimental-strip-types') && existing.includes('/src/cli.ts')

    if (!existing.includes(MANAGED_WRAPPER_MARKER) && !looksLikeManualBridgeWrapper) {
      throw new InstallConflictError(path)
    }
  }

  writeFileSync(path, content, 'utf8')
  chmodSync(path, 0o755)
}

function writeManagedCommand(path: string, content: string, command: string): void {
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8')
    const looksLikeManualBridgeCommand = existing.includes(`opencode-review-bridge ${command}`)

    if (!existing.includes(MANAGED_COMMAND_MARKER) && !looksLikeManualBridgeCommand) {
      throw new InstallConflictError(path)
    }
  }

  writeFileSync(path, content, 'utf8')
}

function renderWrapper(cliPath: string): string {
  return [
    '#!/usr/bin/env bash',
    MANAGED_WRAPPER_MARKER,
    `exec node --experimental-strip-types ${shellQuote(cliPath)} "$@"`,
    '',
  ].join('\n')
}

function pathContains(pathValue: string, expected: string): boolean {
  return pathValue
    .split(delimiter)
    .filter((entry) => entry.length > 0)
    .some((entry) => resolve(entry) === resolve(expected))
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}
