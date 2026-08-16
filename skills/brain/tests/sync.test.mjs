import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { syncInstance } from '../scripts/lib/manage.mjs'
import { createManifest, writeManifest } from '../scripts/lib/manifest.mjs'

const DESCRIPTOR = {
  schemaVersion: 1,
  name: 'brain-framework',
  repository: 'https://github.com/benteoh/brain-framework',
  version: '0.1.0-alpha.1',
}

async function temporaryDirectory(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix))
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

async function sourceFramework() {
  const root = await temporaryDirectory('brain-sync-source-')
  await mkdir(path.join(root, 'skills', 'learn'), { recursive: true })
  await writeFile(path.join(root, 'AGENTS.md'), '# Framework agents\n')
  await writeFile(path.join(root, 'Brain.md'), '# Seed brain\n')
  await writeFile(path.join(root, 'brain-framework.json'), `${JSON.stringify(DESCRIPTOR, null, 2)}\n`)
  await writeFile(
    path.join(root, 'skills', 'learn', 'SKILL.md'),
    '---\nname: learn\ndescription: Learn.\n---\n',
  )
  await addPluginFixture(root, 'chess', {
    name: 'chess',
    version: '0.1.0',
    brain: '>=0.1.0 <0.2.0',
    description: 'Learn chess.',
    dataRoot: 'Learning/Chess',
    skills: ['chess-coach'],
  })
  return root
}

async function cleanCloneTarget({ withPlugin } = {}) {
  const targetRoot = await temporaryDirectory('brain-sync-target-')
  await mkdir(path.join(targetRoot, '.brain'), { recursive: true })
  await writeFile(path.join(targetRoot, 'AGENTS.md'), '# Personal agent contract\n')
  await writeFile(path.join(targetRoot, 'Brain.md'), '# Personal brain\n')
  await writeFile(
    path.join(targetRoot, '.gitignore'),
    '# Brain managed dependencies\n/skills/\n/plugins/\n/.brain/local.json\n/.brain/managed-files.json\n',
  )
  const manifest = createManifest(DESCRIPTOR)
  if (withPlugin) manifest.plugins = [{ name: 'chess', version: '0.1.0' }]
  await writeManifest(targetRoot, manifest)
  return targetRoot
}

test('sync installs core skills into a clean clone and records ignored local state', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await cleanCloneTarget()

  const result = await syncInstance({ sourceRoot, targetRoot })

  assert.equal(result.status, 'installed')
  assert.match(
    await readFile(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'), 'utf8'),
    /name: learn/,
  )
  const localState = JSON.parse(await readFile(path.join(targetRoot, '.brain', 'local.json'), 'utf8'))
  assert.equal(localState.sourceRoot, sourceRoot)
  const metadata = JSON.parse(
    await readFile(path.join(targetRoot, '.brain', 'managed-files.json'), 'utf8'),
  )
  assert.ok(metadata.files['skills/learn/SKILL.md'])
})

test('sync restores a managed file that was deleted locally', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await cleanCloneTarget()
  await syncInstance({ sourceRoot, targetRoot })
  await rm(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'))

  const result = await syncInstance({ sourceRoot, targetRoot })

  assert.equal(result.status, 'updated')
  assert.ok(result.files.includes('skills/learn/SKILL.md'))
  await access(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'))
})

test('sync installs manifest-declared plugins without creating their data root', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await cleanCloneTarget({ withPlugin: true })

  const result = await syncInstance({ sourceRoot, targetRoot })

  assert.equal(result.status, 'installed')
  await access(path.join(targetRoot, 'plugins', 'chess', 'brain-plugin.json'))
  await assert.rejects(access(path.join(targetRoot, 'Learning', 'Chess')), { code: 'ENOENT' })
})

test('sync preserves personal files byte-for-byte', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await cleanCloneTarget()
  await mkdir(path.join(targetRoot, 'Learning'), { recursive: true })
  await writeFile(path.join(targetRoot, 'Learning', 'Notes.md'), 'keep me\n')

  await syncInstance({ sourceRoot, targetRoot })

  assert.equal(await readFile(path.join(targetRoot, 'AGENTS.md'), 'utf8'), '# Personal agent contract\n')
  assert.equal(await readFile(path.join(targetRoot, 'Brain.md'), 'utf8'), '# Personal brain\n')
  assert.equal(await readFile(path.join(targetRoot, 'Learning', 'Notes.md'), 'utf8'), 'keep me\n')
})

test('sync rejects a source whose framework version does not match the manifest', async () => {
  const sourceRoot = await sourceFramework()
  await writeFile(
    path.join(sourceRoot, 'brain-framework.json'),
    `${JSON.stringify({ ...DESCRIPTOR, version: '0.2.0' }, null, 2)}\n`,
  )
  const targetRoot = await cleanCloneTarget()

  const result = await syncInstance({ sourceRoot, targetRoot })

  assert.equal(result.status, 'conflict')
  await assert.rejects(access(path.join(targetRoot, 'skills', 'learn', 'SKILL.md')), { code: 'ENOENT' })
})

test('sync rejects an unmanaged collision without writing anything', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await cleanCloneTarget()
  await mkdir(path.join(targetRoot, 'skills', 'learn'), { recursive: true })
  await writeFile(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'), 'personal note\n')

  const result = await syncInstance({ sourceRoot, targetRoot })

  assert.equal(result.status, 'conflict')
  assert.deepEqual(result.conflicts, ['skills/learn/SKILL.md'])
  assert.equal(
    await readFile(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'), 'utf8'),
    'personal note\n',
  )
  await assert.rejects(readFile(path.join(targetRoot, '.brain', 'local.json'), 'utf8'), {
    code: 'ENOENT',
  })
})

test('sync reports a missing manifest with a repair instruction', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await temporaryDirectory('brain-sync-nomanifest-')

  await assert.rejects(syncInstance({ sourceRoot, targetRoot }), /brain init/)
})

test('sync resolves the framework source from local.json when --source is omitted', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await cleanCloneTarget()
  await syncInstance({ sourceRoot, targetRoot })
  await rm(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'))

  const result = await syncInstance({ targetRoot })

  assert.equal(result.status, 'updated')
  await access(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'))
})
