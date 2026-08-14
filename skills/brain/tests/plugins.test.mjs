import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { addPlugin, getStatus, initInstance } from '../scripts/lib/manage.mjs'

const DESCRIPTOR = {
  schemaVersion: 1,
  name: 'brain-framework',
  repository: 'https://github.com/benteoh/brain-framework',
  version: '0.1.0-alpha.1',
}

async function fixture() {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), 'brain-plugin-source-'))
  const targetRoot = await mkdtemp(path.join(tmpdir(), 'brain-plugin-target-'))
  await mkdir(path.join(sourceRoot, 'skills', 'brain'), { recursive: true })
  await writeFile(path.join(sourceRoot, 'AGENTS.md'), '# Agents\n')
  await writeFile(path.join(sourceRoot, 'Brain.md'), '# Brain\n')
  await writeFile(path.join(sourceRoot, 'brain-framework.json'), `${JSON.stringify(DESCRIPTOR, null, 2)}\n`)
  await writeFile(
    path.join(sourceRoot, 'skills', 'brain', 'SKILL.md'),
    '---\nname: brain\ndescription: Manage Brain.\n---\n',
  )
  await addPluginFixture(sourceRoot, 'chess', {
    name: 'chess',
    version: '0.1.0',
    brain: '>=0.1.0 <0.2.0',
    description: 'Learn chess.',
    dataRoot: 'Learning/Chess',
    skills: ['chess-coach'],
    uses: { optional: ['render:html'] },
  })
  await addPluginFixture(sourceRoot, 'studio', {
    name: 'studio',
    version: '0.2.0',
    brain: '>=0.1.0 <0.2.0',
    description: 'Render interactive artifacts.',
    dataRoot: 'Artifacts',
    skills: ['studio'],
    provides: ['render:html'],
  })
  await initInstance({ sourceRoot, targetRoot })
  return { sourceRoot, targetRoot }
}

async function addPluginFixture(root, name, manifest) {
  const pluginRoot = path.join(root, 'plugins', name)
  await mkdir(path.join(pluginRoot, 'skills', manifest.skills[0]), { recursive: true })
  await writeFile(
    path.join(pluginRoot, 'brain-plugin.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  await writeFile(path.join(pluginRoot, 'README.md'), `# ${name}\n`)
  await writeFile(
    path.join(pluginRoot, 'skills', manifest.skills[0], 'SKILL.md'),
    `---\nname: ${manifest.skills[0]}\ndescription: Use ${name}.\n---\n`,
  )
}

async function readManifest(targetRoot) {
  return JSON.parse(await readFile(path.join(targetRoot, '.brain', 'manifest.json'), 'utf8'))
}

test('installs and tracks plugin code without creating its data root', async () => {
  const { sourceRoot, targetRoot } = await fixture()

  const result = await addPlugin({ sourceRoot, targetRoot, name: 'chess' })
  const metadata = JSON.parse(
    await readFile(path.join(targetRoot, '.brain', 'managed-files.json'), 'utf8'),
  )

  assert.equal(result.status, 'installed')
  assert.ok(metadata.plugins.chess)
  assert.ok(metadata.files['plugins/chess/brain-plugin.json'])
  await assert.rejects(access(path.join(targetRoot, 'Learning', 'Chess')), { code: 'ENOENT' })
})

test('plugin addition changes the tracked manifest after installing code', async () => {
  const { sourceRoot, targetRoot } = await fixture()

  await addPlugin({ sourceRoot, targetRoot, name: 'chess' })
  const manifest = await readManifest(targetRoot)

  assert.deepEqual(manifest.plugins, [{ name: 'chess', version: '0.1.0' }])
})

test('plugin manifest entries stay sorted by name regardless of install order', async () => {
  const { sourceRoot, targetRoot } = await fixture()

  await addPlugin({ sourceRoot, targetRoot, name: 'studio' })
  await addPlugin({ sourceRoot, targetRoot, name: 'chess' })
  const manifest = await readManifest(targetRoot)

  assert.deepEqual(
    manifest.plugins.map((plugin) => plugin.name),
    ['chess', 'studio'],
  )
})

test('unknown plugin fails without changing metadata or the manifest', async () => {
  const { sourceRoot, targetRoot } = await fixture()
  const metadataFile = path.join(targetRoot, '.brain', 'managed-files.json')
  const manifestFile = path.join(targetRoot, '.brain', 'manifest.json')
  const metadataBefore = await readFile(metadataFile, 'utf8')
  const manifestBefore = await readFile(manifestFile, 'utf8')

  await assert.rejects(
    addPlugin({ sourceRoot, targetRoot, name: 'missing' }),
    /Unknown plugin: missing/,
  )

  assert.equal(await readFile(metadataFile, 'utf8'), metadataBefore)
  assert.equal(await readFile(manifestFile, 'utf8'), manifestBefore)
})

test('repeat plugin installation is idempotent and never duplicates the manifest entry', async () => {
  const { sourceRoot, targetRoot } = await fixture()
  await addPlugin({ sourceRoot, targetRoot, name: 'chess' })

  const result = await addPlugin({ sourceRoot, targetRoot, name: 'chess' })
  const manifest = await readManifest(targetRoot)

  assert.equal(result.status, 'unchanged')
  assert.deepEqual(result.files, [])
  assert.deepEqual(manifest.plugins, [{ name: 'chess', version: '0.1.0' }])
})

test('addPlugin rejects an unmanaged collision without changing the manifest', async () => {
  const { sourceRoot, targetRoot } = await fixture()
  await mkdir(path.join(targetRoot, 'plugins', 'chess'), { recursive: true })
  await writeFile(path.join(targetRoot, 'plugins', 'chess', 'brain-plugin.json'), 'personal\n')
  const manifestFile = path.join(targetRoot, '.brain', 'manifest.json')
  const manifestBefore = await readFile(manifestFile, 'utf8')

  const result = await addPlugin({ sourceRoot, targetRoot, name: 'chess' })

  assert.equal(result.status, 'conflict')
  assert.equal(await readFile(manifestFile, 'utf8'), manifestBefore)
})

test('status reports missing optional capabilities without failing the plugin', async () => {
  const { sourceRoot, targetRoot } = await fixture()
  await addPlugin({ sourceRoot, targetRoot, name: 'chess' })

  const result = await getStatus({ sourceRoot, targetRoot })

  assert.deepEqual(result.enabledPlugins, ['chess'])
  assert.deepEqual(result.providedCapabilities, [])
  assert.deepEqual(result.missingOptionalCapabilities, {
    chess: ['render:html'],
  })
})
