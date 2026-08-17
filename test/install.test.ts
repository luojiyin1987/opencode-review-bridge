import assert from 'node:assert/strict'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { main } from '../src/cli.ts'
import {
  InstallConflictError,
  installGlobal,
  renderGlobalCommand,
  renderInstallResult,
  type InstallResult,
} from '../src/install.ts'

function fixture(): { home: string; sourceRoot: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'orb-install-'))
  const home = join(root, 'home')
  const sourceRoot = join(root, 'source with spaces')

  mkdirSync(join(sourceRoot, '.opencode', 'commands'), { recursive: true })
  mkdirSync(join(sourceRoot, 'src'), { recursive: true })
  writeFileSync(join(sourceRoot, 'src', 'cli.ts'), '// fixture\n')
  writeFileSync(
    join(sourceRoot, '.opencode', 'commands', 'review-pull.md'),
    '---\ndescription: pull\n---\n\n!`npm run --silent review-pull`\n',
  )
  writeFileSync(
    join(sourceRoot, '.opencode', 'commands', 'review-push.md'),
    '---\ndescription: push\n---\n\nnpm run --silent review-push -- --file .git/result.json\n',
  )

  return {
    home,
    sourceRoot,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

test('installs the wrapper and global OpenCode commands', () => {
  const value = fixture()
  try {
    const binDir = join(value.home, '.local', 'bin')
    const result = installGlobal({
      home: value.home,
      sourceRoot: value.sourceRoot,
      path: binDir,
    })

    assert.equal(result.pathWarning, false)
    assert.equal(statSync(result.wrapperPath).mode & 0o777, 0o755)
    assert.match(readFileSync(result.wrapperPath, 'utf8'), /source with spaces\/src\/cli\.ts'/)
    assert.match(readFileSync(result.commandPaths[0], 'utf8'), /opencode-review-bridge review-pull/)
    assert.match(readFileSync(result.commandPaths[1], 'utf8'), /opencode-review-bridge review-push --file/)
  } finally {
    value.cleanup()
  }
})

test('reinstall updates bridge-managed files', () => {
  const value = fixture()
  try {
    installGlobal({ home: value.home, sourceRoot: value.sourceRoot, path: '' })
    const template = join(value.sourceRoot, '.opencode', 'commands', 'review-pull.md')
    writeFileSync(template, '---\ndescription: updated\n---\n\n!`npm run --silent review-pull`\n')

    const result = installGlobal({ home: value.home, sourceRoot: value.sourceRoot, path: '' })
    assert.match(readFileSync(result.commandPaths[0], 'utf8'), /description: updated/)
  } finally {
    value.cleanup()
  }
})

test('accepts the manual wrapper shape used before the installer existed', () => {
  const value = fixture()
  try {
    const binDir = join(value.home, '.local', 'bin')
    mkdirSync(binDir, { recursive: true })
    const wrapper = join(binDir, 'opencode-review-bridge')
    writeFileSync(
      wrapper,
      '#!/usr/bin/env bash\nexec node --experimental-strip-types /old/src/cli.ts "$@"\n',
    )
    chmodSync(wrapper, 0o755)

    installGlobal({ home: value.home, sourceRoot: value.sourceRoot, path: binDir })
    assert.match(readFileSync(wrapper, 'utf8'), /managed wrapper/)
  } finally {
    value.cleanup()
  }
})

test('refuses to overwrite an unrelated OpenCode command', () => {
  const value = fixture()
  try {
    const commandsDir = join(value.home, '.config', 'opencode', 'commands')
    mkdirSync(commandsDir, { recursive: true })
    writeFileSync(join(commandsDir, 'review-pull.md'), 'my unrelated command\n')

    assert.throws(
      () => installGlobal({ home: value.home, sourceRoot: value.sourceRoot, path: '' }),
      InstallConflictError,
    )
  } finally {
    value.cleanup()
  }
})

test('reports when the installed bin directory is not on PATH', () => {
  const value = fixture()
  try {
    const result = installGlobal({
      home: value.home,
      sourceRoot: value.sourceRoot,
      path: '/usr/bin',
    })

    assert.equal(result.pathWarning, true)
    assert.match(renderInstallResult(result), /is not on PATH/)
  } finally {
    value.cleanup()
  }
})

test('global command rendering is deterministic', () => {
  const template = '---\ndescription: pull\n---\n\n!`npm run --silent review-pull`\n'
  const once = renderGlobalCommand(template)
  assert.equal(renderGlobalCommand(once), once)
})

test('cli exposes the install command', () => {
  let stdout = ''
  let stderr = ''
  const io = {
    stdout: (value: string) => { stdout += value },
    stderr: (value: string) => { stderr += value },
  }
  const result: InstallResult = {
    wrapperPath: '/home/user/.local/bin/opencode-review-bridge',
    commandPaths: [
      '/home/user/.config/opencode/commands/review-pull.md',
      '/home/user/.config/opencode/commands/review-push.md',
    ],
    pathWarning: false,
  }

  assert.equal(main(['install'], io, () => 'unused', () => 'unused', () => result), 0)
  assert.match(stdout, /Global install complete/)
  assert.equal(stderr, '')
})
