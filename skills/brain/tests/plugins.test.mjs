import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { addPlugin, getStatus, initInstance } from '../scripts/lib/manage.mjs'

async function fixture() {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), 'brain-plugin-source-'))
  const targetRoot = await mkdtemp(path.join(tmpdir(), 'brain-plugin-target-'))
  await mkdir(path.join(sourceRoot, 'skills', 'brain'), { recursive: true })
  await writeFile(path.join(sourceRoot, 'AGENTS.md'), '# Agents\n')
  await writeFile(path.join(sourceRoot, 'Brain.md'), '# Brain\n')
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

test('unknown plugin fails without changing metadata', async () => {
  const { sourceRoot, targetRoot } = await fixture()
  const metadataFile = path.join(targetRoot, '.brain', 'managed-files.json')
  const before = await readFile(metadataFile, 'utf8')

  await assert.rejects(
    addPlugin({ sourceRoot, targetRoot, name: 'missing' }),
    /Unknown plugin: missing/,
  )

  assert.equal(await readFile(metadataFile, 'utf8'), before)
})

test('repeat plugin installation is idempotent', async () => {
  const { sourceRoot, targetRoot } = await fixture()
  await addPlugin({ sourceRoot, targetRoot, name: 'chess' })

  const result = await addPlugin({ sourceRoot, targetRoot, name: 'chess' })

  assert.equal(result.status, 'unchanged')
  assert.deepEqual(result.files, [])
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
