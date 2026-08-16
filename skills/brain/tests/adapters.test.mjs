import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, readlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { syncClaudeCodeAdapter } from '../scripts/lib/adapters.mjs'
import { addPlugin, initInstance } from '../scripts/lib/manage.mjs'

const DESCRIPTOR = {
  schemaVersion: 1,
  name: 'brain-framework',
  repository: 'https://github.com/benteoh/brain-framework',
  version: '0.1.0-alpha.1',
}

async function temporaryDirectory(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix))
}

async function writeSkill(root, relativeDir, name) {
  await mkdir(path.join(root, relativeDir), { recursive: true })
  await writeFile(
    path.join(root, relativeDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Use ${name}.\n---\n`,
  )
}

async function writePluginManifest(root, name, extra = {}) {
  const pluginRoot = path.join(root, 'plugins', name)
  await mkdir(pluginRoot, { recursive: true })
  await writeFile(
    path.join(pluginRoot, 'brain-plugin.json'),
    `${JSON.stringify(
      { name, version: '0.1.0', brain: '>=0.1.0 <0.2.0', description: `Use ${name}.`, dataRoot: `Learning/${name}`, ...extra },
      null,
      2,
    )}\n`,
  )
  await writeFile(path.join(pluginRoot, 'README.md'), `# ${name}\n`)
}

// A source framework with core skills (learn, reflect, review-learning, plus brain itself, which
// must never be adapted) and two plugins: coach (two skills, chess + language) and studio (a
// single skill self-named the same as the plugin).
async function sourceFramework() {
  const root = await temporaryDirectory('brain-adapter-source-')
  await writeFile(path.join(root, 'AGENTS.md'), '# Framework agents\n')
  await writeFile(path.join(root, 'Brain.md'), '# Seed brain\n')
  await writeFile(path.join(root, 'brain-framework.json'), `${JSON.stringify(DESCRIPTOR, null, 2)}\n`)

  await writeSkill(root, path.join('skills', 'brain'), 'brain')
  await writeSkill(root, path.join('skills', 'learn'), 'learn')
  await writeSkill(root, path.join('skills', 'reflect'), 'reflect')
  await writeSkill(root, path.join('skills', 'review-learning'), 'review-learning')

  await writePluginManifest(root, 'coach', { skills: ['chess', 'language'] })
  await writeSkill(root, path.join('plugins', 'coach', 'skills', 'chess'), 'chess')
  await writeSkill(root, path.join('plugins', 'coach', 'skills', 'language'), 'language')

  await writePluginManifest(root, 'studio', { skills: ['studio'] })
  await writeSkill(root, path.join('plugins', 'studio', 'skills', 'studio'), 'studio')

  return root
}

async function installedTarget() {
  const sourceRoot = await sourceFramework()
  const targetRoot = await temporaryDirectory('brain-adapter-target-')
  await initInstance({ sourceRoot, targetRoot })
  await addPlugin({ sourceRoot, targetRoot, name: 'coach' })
  await addPlugin({ sourceRoot, targetRoot, name: 'studio' })
  return { sourceRoot, targetRoot }
}

async function assertSymlinkedTo(linkPath, expectedTarget) {
  const stats = await lstat(linkPath)
  assert.ok(stats.isSymbolicLink(), `${linkPath} should be a symlink`)
  const raw = await readlink(linkPath)
  const resolved = path.resolve(path.dirname(linkPath), raw)
  assert.equal(resolved, path.resolve(expectedTarget))
}

test('fresh target creates a correctly named and disambiguated symlink for every installed skill', async () => {
  const { targetRoot } = await installedTarget()

  const result = await syncClaudeCodeAdapter({ targetRoot })

  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.unchanged, [])
  assert.deepEqual(result.created.sort(), [
    'coach-chess',
    'coach-language',
    'learn',
    'reflect',
    'review-learning',
    'studio',
  ])

  // brain itself is the manager, never adapted.
  await assert.rejects(lstat(path.join(targetRoot, '.claude', 'skills', 'brain')), { code: 'ENOENT' })

  await assertSymlinkedTo(
    path.join(targetRoot, '.claude', 'skills', 'learn'),
    path.join(targetRoot, 'skills', 'learn'),
  )
  await assertSymlinkedTo(
    path.join(targetRoot, '.claude', 'skills', 'reflect'),
    path.join(targetRoot, 'skills', 'reflect'),
  )
  await assertSymlinkedTo(
    path.join(targetRoot, '.claude', 'skills', 'review-learning'),
    path.join(targetRoot, 'skills', 'review-learning'),
  )
  // coach has two skills, so both adapt with the plugin prefix to make their origin unambiguous.
  await assertSymlinkedTo(
    path.join(targetRoot, '.claude', 'skills', 'coach-chess'),
    path.join(targetRoot, 'plugins', 'coach', 'skills', 'chess'),
  )
  await assertSymlinkedTo(
    path.join(targetRoot, '.claude', 'skills', 'coach-language'),
    path.join(targetRoot, 'plugins', 'coach', 'skills', 'language'),
  )
  // studio's only skill already shares the plugin's own name, so it adapts bare.
  await assertSymlinkedTo(
    path.join(targetRoot, '.claude', 'skills', 'studio'),
    path.join(targetRoot, 'plugins', 'studio', 'skills', 'studio'),
  )

  // The symlink is genuinely readable through, not just present.
  assert.match(
    await readFile(path.join(targetRoot, '.claude', 'skills', 'learn', 'SKILL.md'), 'utf8'),
    /name: learn/,
  )
})

test('re-running the adapter is idempotent: reports unchanged, creates nothing new, no error', async () => {
  const { targetRoot } = await installedTarget()
  await syncClaudeCodeAdapter({ targetRoot })

  const result = await syncClaudeCodeAdapter({ targetRoot })

  assert.deepEqual(result.created, [])
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.unchanged.sort(), [
    'coach-chess',
    'coach-language',
    'learn',
    'reflect',
    'review-learning',
    'studio',
  ])
})

test('a pre-existing unrelated directory at a would-be adapter path is a conflict, and nothing is written for any adapter that run', async () => {
  const { targetRoot } = await installedTarget()
  await mkdir(path.join(targetRoot, '.claude', 'skills', 'studio'), { recursive: true })
  await writeFile(
    path.join(targetRoot, '.claude', 'skills', 'studio', 'SKILL.md'),
    'unrelated pre-existing content\n',
  )

  const result = await syncClaudeCodeAdapter({ targetRoot })

  assert.deepEqual(result.created, [])
  assert.deepEqual(result.conflicts, ['studio'])
  assert.equal(
    await readFile(path.join(targetRoot, '.claude', 'skills', 'studio', 'SKILL.md'), 'utf8'),
    'unrelated pre-existing content\n',
  )
  // No partial writes: none of the other, non-conflicting adapters were created either.
  await assert.rejects(lstat(path.join(targetRoot, '.claude', 'skills', 'learn')), { code: 'ENOENT' })
  await assert.rejects(lstat(path.join(targetRoot, '.claude', 'skills', 'coach-chess')), { code: 'ENOENT' })
  await assert.rejects(lstat(path.join(targetRoot, '.claude', 'skills', 'coach-language')), { code: 'ENOENT' })
  await assert.rejects(lstat(path.join(targetRoot, '.claude', 'skills', 'reflect')), { code: 'ENOENT' })
  await assert.rejects(lstat(path.join(targetRoot, '.claude', 'skills', 'review-learning')), { code: 'ENOENT' })
})
