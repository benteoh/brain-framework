import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

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

// The three defects that let a vault sit on stale code while sync reported
// success. Found by syncing a real vault after a release and discovering that
// every file it already had was still the version it was installed at.

test('sync updates a managed file whose source changed', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await cleanCloneTarget()
  await syncInstance({ sourceRoot, targetRoot })

  const skill = path.join('skills', 'learn', 'SKILL.md')
  await writeFile(path.join(sourceRoot, skill), '---\nname: learn\ndescription: Learn better.\n---\n')

  const result = await syncInstance({ sourceRoot, targetRoot })

  assert.equal(result.status, 'updated')
  assert.ok(result.files.includes('skills/learn/SKILL.md'), 'the changed file must be rewritten')
  assert.match(await readFile(path.join(targetRoot, skill), 'utf8'), /Learn better/)
  const metadata = JSON.parse(await readFile(path.join(targetRoot, '.brain', 'managed-files.json'), 'utf8'))
  assert.equal(
    metadata.files['skills/learn/SKILL.md'],
    createHash('sha256').update(await readFile(path.join(targetRoot, skill))).digest('hex'),
    'the recorded checksum must track the version now on disk',
  )
})

test('sync is a no-op when the source has not moved', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await cleanCloneTarget()
  await syncInstance({ sourceRoot, targetRoot })

  const result = await syncInstance({ sourceRoot, targetRoot })

  assert.equal(result.status, 'unchanged')
  assert.deepEqual(result.files, [])
})

test('sync still refuses to clobber a locally edited managed file', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await cleanCloneTarget()
  await syncInstance({ sourceRoot, targetRoot })

  const skill = path.join('skills', 'learn', 'SKILL.md')
  await writeFile(path.join(targetRoot, skill), '---\nname: learn\ndescription: My own edit.\n---\n')
  await writeFile(path.join(sourceRoot, skill), '---\nname: learn\ndescription: Upstream edit.\n---\n')

  const result = await syncInstance({ sourceRoot, targetRoot })

  assert.equal(result.status, 'conflict')
  assert.deepEqual(result.conflicts, ['skills/learn/SKILL.md'])
  assert.match(await readFile(path.join(targetRoot, skill), 'utf8'), /My own edit/)
})

test('sync does not distribute files the source repository ignores', async () => {
  // Build output is gitignored so it stops being reviewed as a diff. Without
  // this it kept being copied into every vault, which is the worse half of the
  // same problem.
  const sourceRoot = await sourceFramework()
  await execFileAsync('git', ['-C', sourceRoot, 'init', '-q'])
  await writeFile(path.join(sourceRoot, '.gitignore'), 'plugins/chess/dist/\n*.generated.md\n')
  await mkdir(path.join(sourceRoot, 'plugins', 'chess', 'dist'), { recursive: true })
  await writeFile(path.join(sourceRoot, 'plugins', 'chess', 'dist', 'bundle.js'), 'built\n')
  await writeFile(path.join(sourceRoot, 'plugins', 'chess', 'notes.generated.md'), 'built\n')
  await writeFile(path.join(sourceRoot, 'plugins', 'chess', 'notes.md'), 'real\n')

  const targetRoot = await cleanCloneTarget({ withPlugin: true })
  await syncInstance({ sourceRoot, targetRoot })

  await access(path.join(targetRoot, 'plugins', 'chess', 'notes.md'))
  await assert.rejects(() => access(path.join(targetRoot, 'plugins', 'chess', 'dist', 'bundle.js')))
  await assert.rejects(() => access(path.join(targetRoot, 'plugins', 'chess', 'notes.generated.md')))
})

test('sync removes a pristine file the source stopped shipping, and keeps an edited one', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await cleanCloneTarget()
  await writeFile(path.join(sourceRoot, 'skills', 'learn', 'retired.md'), 'retired\n')
  await writeFile(path.join(sourceRoot, 'skills', 'learn', 'adopted.md'), 'adopted\n')
  await syncInstance({ sourceRoot, targetRoot })

  await rm(path.join(sourceRoot, 'skills', 'learn', 'retired.md'))
  await rm(path.join(sourceRoot, 'skills', 'learn', 'adopted.md'))
  await writeFile(path.join(targetRoot, 'skills', 'learn', 'adopted.md'), 'I changed this\n')

  const result = await syncInstance({ sourceRoot, targetRoot })

  // The edited one is a conflict, not a deletion: nothing a person touched is
  // removed on their behalf.
  assert.equal(result.status, 'conflict')
  assert.deepEqual(result.conflicts, ['skills/learn/adopted.md'])
  await access(path.join(targetRoot, 'skills', 'learn', 'retired.md'))

  await rm(path.join(targetRoot, 'skills', 'learn', 'adopted.md'))
  const second = await syncInstance({ sourceRoot, targetRoot })
  assert.equal(second.status, 'updated')
  assert.deepEqual(second.removed, ['skills/learn/retired.md'])
  await assert.rejects(() => access(path.join(targetRoot, 'skills', 'learn', 'retired.md')))
})

test('sync records the plugin version actually installed, not the one already written down', async () => {
  // The manifest exists to be a reproducible record of this instance. Rebuilt
  // from itself, it could only restate what it already said, so a plugin
  // version bump arrived as code and never as a version.
  const sourceRoot = await sourceFramework()
  const targetRoot = await cleanCloneTarget({ withPlugin: true })
  await syncInstance({ sourceRoot, targetRoot })

  const descriptorPath = path.join(sourceRoot, 'plugins', 'chess', 'brain-plugin.json')
  const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'))
  await writeFile(descriptorPath, `${JSON.stringify({ ...descriptor, version: '0.2.0' }, null, 2)}\n`)

  await syncInstance({ sourceRoot, targetRoot })

  const manifest = JSON.parse(await readFile(path.join(targetRoot, '.brain', 'manifest.json'), 'utf8'))
  assert.deepEqual(manifest.plugins, [{ name: 'chess', version: '0.2.0' }])
  const metadata = JSON.parse(await readFile(path.join(targetRoot, '.brain', 'managed-files.json'), 'utf8'))
  assert.deepEqual(metadata.plugins, { chess: { version: '0.2.0' } })
})
