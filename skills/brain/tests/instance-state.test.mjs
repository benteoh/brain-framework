import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  LOCAL_STATE_PATH,
  MANAGED_FILES_PATH,
  MANIFEST_PATH,
  ensureDependencyIgnoreBlock,
  readLocalState,
  writeLocalState,
} from '../scripts/lib/instance-state.mjs'
import { createManifest, writeManifest } from '../scripts/lib/manifest.mjs'

const IGNORE_BLOCK =
  '# Brain managed dependencies\n/skills/\n/plugins/\n/.brain/local.json\n/.brain/managed-files.json\n'

async function temporaryDirectory(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix))
}

test('path constants point at the expected .brain files', () => {
  assert.equal(MANIFEST_PATH, path.join('.brain', 'manifest.json'))
  assert.equal(LOCAL_STATE_PATH, path.join('.brain', 'local.json'))
  assert.equal(MANAGED_FILES_PATH, path.join('.brain', 'managed-files.json'))
})

test('creates a gitignore with the exact dependency block when absent', async () => {
  const targetRoot = await temporaryDirectory('brain-ignore-absent-')

  const result = await ensureDependencyIgnoreBlock(targetRoot)

  assert.equal(result.status, 'created')
  const raw = await readFile(path.join(targetRoot, '.gitignore'), 'utf8')
  assert.equal(raw, IGNORE_BLOCK)
})

test('appends the block after a non-newline-terminated existing file', async () => {
  const targetRoot = await temporaryDirectory('brain-ignore-noeol-')
  await writeFile(path.join(targetRoot, '.gitignore'), 'node_modules/')

  const result = await ensureDependencyIgnoreBlock(targetRoot)

  assert.equal(result.status, 'appended')
  const raw = await readFile(path.join(targetRoot, '.gitignore'), 'utf8')
  assert.equal(raw, `node_modules/\n${IGNORE_BLOCK}`)
})

test('appends the block after an existing unrelated rule, preserving it exactly', async () => {
  const targetRoot = await temporaryDirectory('brain-ignore-existing-')
  await writeFile(path.join(targetRoot, '.gitignore'), '*.log\nnode_modules/\n')

  const result = await ensureDependencyIgnoreBlock(targetRoot)

  assert.equal(result.status, 'appended')
  const raw = await readFile(path.join(targetRoot, '.gitignore'), 'utf8')
  assert.equal(raw, `*.log\nnode_modules/\n${IGNORE_BLOCK}`)
  assert.ok(raw.startsWith('*.log\nnode_modules/\n'))
})

test('is idempotent on repeated calls', async () => {
  const targetRoot = await temporaryDirectory('brain-ignore-repeat-')
  await ensureDependencyIgnoreBlock(targetRoot)

  const second = await ensureDependencyIgnoreBlock(targetRoot)

  assert.equal(second.status, 'unchanged')
  const raw = await readFile(path.join(targetRoot, '.gitignore'), 'utf8')
  assert.equal(raw, IGNORE_BLOCK)
})

test('reports a conflict for a partially copied block instead of duplicating rules', async () => {
  const targetRoot = await temporaryDirectory('brain-ignore-partial-')
  await writeFile(path.join(targetRoot, '.gitignore'), '# Brain managed dependencies\n/skills/\n')

  const result = await ensureDependencyIgnoreBlock(targetRoot)

  assert.equal(result.status, 'conflict')
  assert.deepEqual(result.conflicts, ['/skills/'])
  const raw = await readFile(path.join(targetRoot, '.gitignore'), 'utf8')
  assert.equal(raw, '# Brain managed dependencies\n/skills/\n')
})

test('writeLocalState records the resolved absolute source root', async () => {
  const targetRoot = await temporaryDirectory('brain-local-state-')
  const sourceRoot = await temporaryDirectory('brain-local-source-')

  await writeLocalState(targetRoot, { sourceRoot })
  const state = await readLocalState(targetRoot)

  assert.equal(state.schemaVersion, 1)
  assert.equal(state.sourceRoot, path.resolve(sourceRoot))
})

test('the tracked manifest never contains the resolved local source path', async () => {
  const targetRoot = await temporaryDirectory('brain-local-manifest-')
  const sourceRoot = await temporaryDirectory('brain-local-manifest-source-')
  const descriptor = {
    schemaVersion: 1,
    name: 'brain-framework',
    repository: 'https://github.com/benteoh/brain-framework',
    version: '0.1.0-alpha.1',
  }

  await writeManifest(targetRoot, createManifest(descriptor))
  await writeLocalState(targetRoot, { sourceRoot })

  const manifestRaw = await readFile(path.join(targetRoot, MANIFEST_PATH), 'utf8')
  const localRaw = await readFile(path.join(targetRoot, LOCAL_STATE_PATH), 'utf8')

  assert.ok(!manifestRaw.includes(sourceRoot))
  assert.ok(localRaw.includes(path.resolve(sourceRoot)))
})
