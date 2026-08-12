import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { initInstance, updateInstance } from '../scripts/lib/manage.mjs'

async function temporaryDirectory(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix))
}

async function sourceFramework() {
  const root = await temporaryDirectory('brain-source-')
  await mkdir(path.join(root, 'skills', 'learn', 'scripts'), { recursive: true })
  await writeFile(path.join(root, 'AGENTS.md'), '# Framework agents\n')
  await writeFile(path.join(root, 'Brain.md'), '# Seed brain\n')
  await writeFile(
    path.join(root, 'skills', 'learn', 'SKILL.md'),
    '---\nname: learn\ndescription: Learn.\n---\n',
  )
  await writeFile(path.join(root, 'skills', 'learn', 'scripts', 'helper.mjs'), 'export {}\n')
  return root
}

test('initialises a blank instance and records only managed files', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await temporaryDirectory('brain-target-')

  const result = await initInstance({ sourceRoot, targetRoot })
  const metadata = JSON.parse(
    await readFile(path.join(targetRoot, '.brain', 'managed-files.json'), 'utf8'),
  )

  assert.equal(result.status, 'installed')
  assert.equal(await readFile(path.join(targetRoot, 'AGENTS.md'), 'utf8'), '# Framework agents\n')
  assert.equal(await readFile(path.join(targetRoot, 'Brain.md'), 'utf8'), '# Seed brain\n')
  assert.deepEqual(Object.keys(metadata.files).sort(), [
    'AGENTS.md',
    'skills/learn/SKILL.md',
    'skills/learn/scripts/helper.mjs',
  ])
  assert.equal(metadata.version, 1)
  assert.equal(metadata.source, sourceRoot)
})

test('preserves an existing Brain and AGENTS contract during initialisation', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await temporaryDirectory('brain-target-')
  await writeFile(path.join(targetRoot, 'Brain.md'), '# Personal brain\n')
  await writeFile(path.join(targetRoot, 'AGENTS.md'), '# Personal agent contract\n')

  await initInstance({ sourceRoot, targetRoot })
  const metadata = JSON.parse(
    await readFile(path.join(targetRoot, '.brain', 'managed-files.json'), 'utf8'),
  )

  assert.equal(await readFile(path.join(targetRoot, 'Brain.md'), 'utf8'), '# Personal brain\n')
  assert.equal(
    await readFile(path.join(targetRoot, 'AGENTS.md'), 'utf8'),
    '# Personal agent contract\n',
  )
  assert.equal(metadata.files['AGENTS.md'], undefined)
})

test('updates unchanged managed files and leaves personal files untouched', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await temporaryDirectory('brain-target-')
  await initInstance({ sourceRoot, targetRoot })
  await mkdir(path.join(targetRoot, 'Learning'), { recursive: true })
  await writeFile(path.join(targetRoot, 'Learning', 'Personal.md'), 'keep me\n')
  await writeFile(
    path.join(sourceRoot, 'skills', 'learn', 'SKILL.md'),
    '---\nname: learn\ndescription: Learn from evidence.\n---\n',
  )

  const result = await updateInstance({ sourceRoot, targetRoot })

  assert.equal(result.status, 'updated')
  assert.match(
    await readFile(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'), 'utf8'),
    /Learn from evidence/,
  )
  assert.equal(await readFile(path.join(targetRoot, 'Learning', 'Personal.md'), 'utf8'), 'keep me\n')
})

test('reports a local modification before writing any update', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await temporaryDirectory('brain-target-')
  await initInstance({ sourceRoot, targetRoot })
  const managedSkill = path.join(targetRoot, 'skills', 'learn', 'SKILL.md')
  const managedHelper = path.join(targetRoot, 'skills', 'learn', 'scripts', 'helper.mjs')
  await writeFile(managedSkill, 'local version\n')
  await writeFile(
    path.join(sourceRoot, 'skills', 'learn', 'SKILL.md'),
    '---\nname: learn\ndescription: Upstream version.\n---\n',
  )
  await writeFile(managedHelper, 'installed helper\n')
  await writeFile(
    path.join(sourceRoot, 'skills', 'learn', 'scripts', 'helper.mjs'),
    'upstream helper\n',
  )

  const result = await updateInstance({ sourceRoot, targetRoot })

  assert.equal(result.status, 'conflict')
  assert.deepEqual(result.conflicts, ['skills/learn/SKILL.md', 'skills/learn/scripts/helper.mjs'])
  assert.equal(await readFile(managedSkill, 'utf8'), 'local version\n')
  assert.equal(await readFile(managedHelper, 'utf8'), 'installed helper\n')
})

test('initialisation refuses an unmanaged skill collision without partial writes', async () => {
  const sourceRoot = await sourceFramework()
  const targetRoot = await temporaryDirectory('brain-target-')
  await mkdir(path.join(targetRoot, 'skills', 'learn'), { recursive: true })
  await writeFile(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'), 'personal skill\n')

  const result = await initInstance({ sourceRoot, targetRoot })

  assert.equal(result.status, 'conflict')
  assert.deepEqual(result.conflicts, ['skills/learn/SKILL.md'])
  assert.equal(await readFile(path.join(targetRoot, 'skills', 'learn', 'SKILL.md'), 'utf8'), 'personal skill\n')
  await assert.rejects(readFile(path.join(targetRoot, 'Brain.md'), 'utf8'), { code: 'ENOENT' })
})
