import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createManifest,
  readFrameworkDescriptor,
  readManifest,
  validateManifest,
  writeManifest,
} from '../scripts/lib/manifest.mjs'

const descriptor = {
  schemaVersion: 1,
  name: 'brain-framework',
  repository: 'https://github.com/benteoh/brain-framework',
  version: '0.1.0-alpha.1',
}

function validManifest() {
  return {
    schemaVersion: 1,
    framework: {
      repository: descriptor.repository,
      version: descriptor.version,
    },
    plugins: [{ name: 'chess', version: '0.1.0' }],
  }
}

async function temporaryDirectory(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix))
}

async function sourceFrameworkWithDescriptor(overrides = {}) {
  const root = await temporaryDirectory('brain-descriptor-')
  await writeFile(
    path.join(root, 'brain-framework.json'),
    `${JSON.stringify({ ...descriptor, ...overrides }, null, 2)}\n`,
  )
  return root
}

test('accepts the exact valid manifest shape', () => {
  assert.deepEqual(validateManifest(validManifest()), { errors: [] })
})

test('rejects an unknown root field', () => {
  const manifest = { ...validManifest(), extra: true }
  const { errors } = validateManifest(manifest)
  assert.ok(errors.some((error) => error.includes('unknown field: extra')))
})

test('rejects an unknown nested framework field', () => {
  const manifest = validManifest()
  manifest.framework = { ...manifest.framework, branch: 'main' }
  const { errors } = validateManifest(manifest)
  assert.ok(errors.some((error) => error.includes('manifest.framework has unknown field: branch')))
})

test('rejects an unknown nested plugin field', () => {
  const manifest = validManifest()
  manifest.plugins = [{ ...manifest.plugins[0], enabled: true }]
  const { errors } = validateManifest(manifest)
  assert.ok(errors.some((error) => error.includes('has unknown field: enabled')))
})

test('rejects an absolute filesystem repository', () => {
  const manifest = validManifest()
  manifest.framework.repository = '/home/benbe/Projects/brain-framework'
  const { errors } = validateManifest(manifest)
  assert.ok(errors.some((error) => error.includes('framework.repository must be an https URL')))
})

test('rejects a file:// repository', () => {
  const manifest = validManifest()
  manifest.framework.repository = 'file:///home/benbe/Projects/brain-framework'
  const { errors } = validateManifest(manifest)
  assert.ok(errors.some((error) => error.includes('framework.repository must be an https URL')))
})

test('rejects a branch-like framework version', () => {
  for (const branchName of ['main', 'latest']) {
    const manifest = validManifest()
    manifest.framework.version = branchName
    const { errors } = validateManifest(manifest)
    assert.ok(
      errors.some((error) => error.includes('framework.version must be an exact release or commit')),
      `expected rejection for version ${branchName}`,
    )
  }
})

test('rejects a branch-like plugin version', () => {
  for (const branchName of ['main', 'latest']) {
    const manifest = validManifest()
    manifest.plugins = [{ name: 'chess', version: branchName }]
    const { errors } = validateManifest(manifest)
    assert.ok(
      errors.some((error) => error.includes('version must be an exact release or commit')),
      `expected rejection for version ${branchName}`,
    )
  }
})

test('rejects duplicate plugin names', () => {
  const manifest = validManifest()
  manifest.plugins = [
    { name: 'chess', version: '0.1.0' },
    { name: 'chess', version: '0.2.0' },
  ]
  const { errors } = validateManifest(manifest)
  assert.ok(errors.some((error) => error.includes('duplicate name: chess')))
})

test('rejects an unsorted plugin list', () => {
  const manifest = validManifest()
  manifest.plugins = [
    { name: 'studio', version: '0.1.0' },
    { name: 'chess', version: '0.1.0' },
  ]
  const { errors } = validateManifest(manifest)
  assert.ok(errors.some((error) => error.includes('plugins must be sorted by name')))
})

test('rejects a malformed plugin version', () => {
  const manifest = validManifest()
  manifest.plugins = [{ name: 'chess', version: 'v1.0' }]
  const { errors } = validateManifest(manifest)
  assert.ok(errors.some((error) => error.includes('version must be an exact release or commit')))
})

test('accepts an exact 40-character commit hash as a version', () => {
  const manifest = validManifest()
  const hash = 'a'.repeat(40)
  manifest.framework.version = hash
  manifest.plugins = [{ name: 'chess', version: hash }]
  assert.deepEqual(validateManifest(manifest), { errors: [] })
})

test('readFrameworkDescriptor reads a valid descriptor', async () => {
  const root = await sourceFrameworkWithDescriptor()
  const value = await readFrameworkDescriptor(root)
  assert.deepEqual(value, descriptor)
})

test('readFrameworkDescriptor rejects a missing brain-framework.json', async () => {
  const root = await temporaryDirectory('brain-missing-descriptor-')
  await assert.rejects(readFrameworkDescriptor(root), /Missing framework descriptor/)
})

test('readFrameworkDescriptor rejects a branch-like descriptor version', async () => {
  const root = await sourceFrameworkWithDescriptor({ version: 'main' })
  await assert.rejects(readFrameworkDescriptor(root), /exact release or commit/)
})

test('createManifest builds a manifest whose framework version matches the descriptor', () => {
  const manifest = createManifest(descriptor)
  assert.deepEqual(manifest, {
    schemaVersion: 1,
    framework: {
      repository: descriptor.repository,
      version: descriptor.version,
    },
    plugins: [],
  })
})

test('createManifest refuses to build from a descriptor with a branch-like version', () => {
  assert.throws(() => createManifest({ ...descriptor, version: 'main' }), /exact release or commit/)
})

test('writeManifest then readManifest round-trips and sorts plugins by name', async () => {
  const targetRoot = await temporaryDirectory('brain-manifest-target-')
  const manifest = validManifest()
  manifest.plugins = [
    { name: 'studio', version: '0.1.0' },
    { name: 'chess', version: '0.1.0' },
  ]

  await writeManifest(targetRoot, manifest)
  const raw = await readFile(path.join(targetRoot, '.brain', 'manifest.json'), 'utf8')
  assert.ok(raw.endsWith('\n'))
  const reread = await readManifest(targetRoot)

  assert.deepEqual(
    reread.plugins.map((plugin) => plugin.name),
    ['chess', 'studio'],
  )
  assert.ok(!JSON.stringify(reread).includes(targetRoot))
})

test('writeManifest refuses to persist an invalid manifest', async () => {
  const targetRoot = await temporaryDirectory('brain-manifest-invalid-')
  await assert.rejects(writeManifest(targetRoot, { ...validManifest(), extra: true }), /unknown field/)
})

test('readManifest reports a repair instruction when the manifest is missing', async () => {
  const targetRoot = await temporaryDirectory('brain-manifest-missing-')
  await assert.rejects(readManifest(targetRoot), /brain init/)
})

test('readManifest rejects a schemaVersion mismatch with the supported contract', async () => {
  const targetRoot = await temporaryDirectory('brain-manifest-schema-')
  await mkdir(path.join(targetRoot, '.brain'), { recursive: true })
  await writeFile(
    path.join(targetRoot, '.brain', 'manifest.json'),
    `${JSON.stringify({ ...validManifest(), schemaVersion: 2 }, null, 2)}\n`,
  )
  await assert.rejects(readManifest(targetRoot), /schemaVersion must be 1/)
})
