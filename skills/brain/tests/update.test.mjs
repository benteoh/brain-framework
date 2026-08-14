import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { addPlugin, initInstance, updateInstance } from '../scripts/lib/manage.mjs'

async function temporaryDirectory(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix))
}

async function writeDescriptor(root, version) {
  await writeFile(
    path.join(root, 'brain-framework.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        name: 'brain-framework',
        repository: 'https://github.com/benteoh/brain-framework',
        version,
      },
      null,
      2,
    )}\n`,
  )
}

async function sourceFramework(version = '0.1.0-alpha.1') {
  const root = await temporaryDirectory('brain-update-source-')
  await mkdir(path.join(root, 'skills', 'learn'), { recursive: true })
  await writeFile(path.join(root, 'AGENTS.md'), '# Agents\n')
  await writeFile(path.join(root, 'Brain.md'), '# Brain\n')
  await writeDescriptor(root, version)
  await writeFile(
    path.join(root, 'skills', 'learn', 'SKILL.md'),
    '---\nname: learn\ndescription: Learn.\n---\n',
  )
  return root
}

async function addPluginFixture(root, name, manifest) {
  const pluginRoot = path.join(root, 'plugins', name)
  await mkdir(path.join(pluginRoot, 'skills', manifest.skills[0]), { recursive: true })
  await writeFile(path.join(pluginRoot, 'brain-plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(path.join(pluginRoot, 'README.md'), `# ${name}\n`)
  await writeFile(
    path.join(pluginRoot, 'skills', manifest.skills[0], 'SKILL.md'),
    `---\nname: ${manifest.skills[0]}\ndescription: Use ${name}.\n---\n`,
  )
}

async function initialisedTarget(sourceRoot) {
  const targetRoot = await temporaryDirectory('brain-update-target-')
  await initInstance({ sourceRoot, targetRoot })
  return targetRoot
}

test('update rejects a missing --to version', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await initialisedTarget(sourceRoot)

  await assert.rejects(updateInstance({ sourceRoot, targetRoot }), /explicit --to VERSION/)
})

test('update rejects a --to that does not match the source descriptor version', async () => {
  const sourceRoot = await sourceFramework('0.1.0-alpha.1')
  const targetRoot = await initialisedTarget(sourceRoot)

  await assert.rejects(
    updateInstance({ sourceRoot, targetRoot, toVersion: '0.9.9' }),
    /does not match the source framework descriptor version/,
  )
})

test('update rejects a branch-like --to version', async () => {
  const sourceRoot = await sourceFramework('0.1.0-alpha.1')
  const targetRoot = await initialisedTarget(sourceRoot)

  await assert.rejects(
    updateInstance({ sourceRoot, targetRoot, toVersion: 'main' }),
    /exact release or commit/,
  )
})

test('update blocks all writes when an installed dependency was locally modified', async () => {
  const sourceRoot = await sourceFramework('0.1.0-alpha.1')
  const targetRoot = await initialisedTarget(sourceRoot)
  await writeFile(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'), 'local edit\n')
  await writeDescriptor(sourceRoot, '0.2.0')
  const manifestBefore = await readFile(path.join(targetRoot, '.brain', 'manifest.json'), 'utf8')
  const metadataBefore = await readFile(path.join(targetRoot, '.brain', 'managed-files.json'), 'utf8')

  const result = await updateInstance({ sourceRoot, targetRoot, toVersion: '0.2.0' })

  assert.equal(result.status, 'conflict')
  assert.deepEqual(result.conflicts, ['skills/learn/SKILL.md'])
  assert.equal(await readFile(path.join(targetRoot, '.brain', 'manifest.json'), 'utf8'), manifestBefore)
  assert.equal(
    await readFile(path.join(targetRoot, '.brain', 'managed-files.json'), 'utf8'),
    metadataBefore,
  )
})

test('a successful update advances ignored dependencies and the tracked manifest together', async () => {
  const sourceRoot = await sourceFramework('0.1.0-alpha.1')
  const targetRoot = await initialisedTarget(sourceRoot)
  await writeFile(
    path.join(sourceRoot, 'skills', 'learn', 'SKILL.md'),
    '---\nname: learn\ndescription: Learn from evidence.\n---\n',
  )
  await writeDescriptor(sourceRoot, '0.2.0')

  const result = await updateInstance({ sourceRoot, targetRoot, toVersion: '0.2.0' })

  assert.equal(result.status, 'updated')
  const manifest = JSON.parse(await readFile(path.join(targetRoot, '.brain', 'manifest.json'), 'utf8'))
  const metadata = JSON.parse(
    await readFile(path.join(targetRoot, '.brain', 'managed-files.json'), 'utf8'),
  )
  assert.equal(manifest.framework.version, '0.2.0')
  assert.equal(metadata.frameworkVersion, '0.2.0')
  assert.match(
    await readFile(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'), 'utf8'),
    /Learn from evidence/,
  )
})

test('a simulated preflight failure leaves the tracked manifest and metadata unchanged', async () => {
  const sourceRoot = await sourceFramework('0.1.0-alpha.1')
  await addPluginFixture(sourceRoot, 'chess', {
    name: 'chess',
    version: '0.1.0',
    brain: '>=0.1.0 <0.2.0',
    description: 'Learn chess.',
    dataRoot: 'Learning/Chess',
    skills: ['chess-coach'],
  })
  const targetRoot = await initialisedTarget(sourceRoot)
  await addPlugin({ sourceRoot, targetRoot, name: 'chess' })
  const manifestBefore = await readFile(path.join(targetRoot, '.brain', 'manifest.json'), 'utf8')
  const metadataBefore = await readFile(path.join(targetRoot, '.brain', 'managed-files.json'), 'utf8')

  // Simulate a broken next release: the framework version advances but the plugin the
  // manifest still declares has vanished from the new source tree.
  await rm(path.join(sourceRoot, 'plugins', 'chess'), { recursive: true, force: true })
  await writeDescriptor(sourceRoot, '0.2.0')

  await assert.rejects(
    updateInstance({ sourceRoot, targetRoot, toVersion: '0.2.0' }),
    /Unknown plugin: chess/,
  )
  assert.equal(await readFile(path.join(targetRoot, '.brain', 'manifest.json'), 'utf8'), manifestBefore)
  assert.equal(
    await readFile(path.join(targetRoot, '.brain', 'managed-files.json'), 'utf8'),
    metadataBefore,
  )
})
