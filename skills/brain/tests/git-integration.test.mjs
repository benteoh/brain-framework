import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const brainCli = path.join(here, '..', 'scripts', 'brain.mjs')

const DESCRIPTOR = {
  schemaVersion: 1,
  name: 'brain-framework',
  repository: 'https://github.com/benteoh/brain-framework',
  version: '0.1.0-alpha.1',
}

async function temporaryDirectory(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix))
}

async function git(cwd, args) {
  return execFileAsync('git', args, { cwd })
}

async function runCli(args) {
  return execFileAsync('node', [brainCli, ...args])
}

async function sourceFramework() {
  const root = await temporaryDirectory('brain-git-source-')
  await mkdir(path.join(root, 'skills', 'learn'), { recursive: true })
  await writeFile(path.join(root, 'AGENTS.md'), '# Framework agents\n')
  await writeFile(path.join(root, 'Brain.md'), '# Seed brain\n')
  await writeFile(path.join(root, 'brain-framework.json'), `${JSON.stringify(DESCRIPTOR, null, 2)}\n`)
  await writeFile(
    path.join(root, 'skills', 'learn', 'SKILL.md'),
    '---\nname: learn\ndescription: Learn from evidence.\n---\n',
  )
  return root
}

async function committedPrivateBrain() {
  const repoRoot = await temporaryDirectory('brain-git-private-')
  await git(repoRoot, ['init'])
  await git(repoRoot, ['config', 'user.email', 'brain-test@example.com'])
  await git(repoRoot, ['config', 'user.name', 'Brain Test'])
  await writeFile(path.join(repoRoot, 'Brain.md'), '# My personal brain\n')
  await writeFile(path.join(repoRoot, 'AGENTS.md'), '# My personal agent contract\n')
  await git(repoRoot, ['add', '-A'])
  await git(repoRoot, ['commit', '-m', 'seed private brain'])
  return repoRoot
}

async function porcelainStatus(repoRoot) {
  // --untracked-files=all expands untracked directories into individual file entries,
  // so a wholly-untracked `.brain/` collapsing to one line can't hide a real leak.
  const { stdout } = await git(repoRoot, ['status', '--porcelain', '--untracked-files=all'])
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort()
}

test('init leaves only the manifest and .gitignore Git-visible in a private Brain', async () => {
  const sourceRoot = await sourceFramework()
  const repoRoot = await committedPrivateBrain()

  await runCli(['init', '--source', sourceRoot, '--target', repoRoot])

  const status = await porcelainStatus(repoRoot)
  assert.deepEqual(
    status.map((line) => line.split(/\s+/, 2)[1]),
    ['.brain/manifest.json', '.gitignore'],
  )

  await git(repoRoot, ['add', '--', '.brain/manifest.json', '.gitignore'])
  await git(repoRoot, ['commit', '-m', 'declare Brain framework dependency'])

  assert.deepEqual(await porcelainStatus(repoRoot), [])
})

test('sync restores deleted ignored dependencies while Git stays clean', async () => {
  const sourceRoot = await sourceFramework()
  const repoRoot = await committedPrivateBrain()

  await runCli(['init', '--source', sourceRoot, '--target', repoRoot])
  await git(repoRoot, ['add', '--', '.brain/manifest.json', '.gitignore'])
  await git(repoRoot, ['commit', '-m', 'declare Brain framework dependency'])
  assert.deepEqual(await porcelainStatus(repoRoot), [])

  // Simulate a fresh clone that lost every ignored, machine-local dependency.
  await rm(path.join(repoRoot, 'skills'), { recursive: true, force: true })
  await rm(path.join(repoRoot, '.brain', 'local.json'), { force: true })
  await rm(path.join(repoRoot, '.brain', 'managed-files.json'), { force: true })
  assert.deepEqual(await porcelainStatus(repoRoot), [])

  await runCli(['sync', '--source', sourceRoot, '--target', repoRoot])

  assert.match(
    await readFile(path.join(repoRoot, 'skills', 'learn', 'SKILL.md'), 'utf8'),
    /Learn from evidence/,
  )
  assert.deepEqual(await porcelainStatus(repoRoot), [])
})
