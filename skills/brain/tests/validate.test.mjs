import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { validateFramework } from '../scripts/lib/validate.mjs'

async function temporaryFramework() {
  const root = await mkdtemp(path.join(tmpdir(), 'brain-validate-'))
  await Promise.all([
    writeFile(path.join(root, 'README.md'), '# Brain\n'),
    writeFile(path.join(root, 'AGENTS.md'), '# Agent contract\n'),
    writeFile(path.join(root, 'Brain.md'), '# Brain\n'),
    writeFile(
      path.join(root, 'brain-framework.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          name: 'brain-framework',
          repository: 'https://github.com/benteoh/brain-framework',
          version: '0.1.0-alpha.1',
        },
        null,
        2,
      )}\n`,
    ),
  ])
  await addSkill(root, 'learn')
  return root
}

async function addSkill(root, name, description = 'Use when learning a topic.') {
  const directory = path.join(root, 'skills', name)
  await mkdir(directory, { recursive: true })
  await writeFile(
    path.join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  )
}

async function addPlugin(root, folder, manifest, skillNames = []) {
  const directory = path.join(root, 'plugins', folder)
  await mkdir(directory, { recursive: true })
  await writeFile(
    path.join(directory, 'brain-plugin.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  for (const skill of skillNames) {
    const skillDirectory = path.join(directory, 'skills', skill)
    await mkdir(skillDirectory, { recursive: true })
    await writeFile(
      path.join(skillDirectory, 'SKILL.md'),
      `---\nname: ${skill}\ndescription: Use when ${skill} is needed.\n---\n`,
    )
  }
}

test('accepts a valid framework', async () => {
  const root = await temporaryFramework()
  await addPlugin(
    root,
    'studio',
    {
      name: 'studio',
      version: '0.1.0',
      brain: '>=0.1.0 <0.2.0',
      description: 'Render interactive artifacts.',
      dataRoot: 'Artifacts',
      skills: ['studio'],
      provides: ['render:html'],
    },
    ['studio'],
  )

  assert.deepEqual(await validateFramework(root), { errors: [], warnings: [] })
})

test('reports a missing root contract', async () => {
  const root = await temporaryFramework()
  await writeFile(path.join(root, 'AGENTS.md'), '')

  const result = await validateFramework(root)

  assert.ok(result.errors.includes('Required root file is empty: AGENTS.md'))
})

test('reports invalid skill frontmatter', async () => {
  const root = await temporaryFramework()
  await writeFile(path.join(root, 'skills', 'learn', 'SKILL.md'), '# Learn\n')

  const result = await validateFramework(root)

  assert.ok(result.errors.some((error) => error.includes('missing YAML frontmatter')))
})

test('reports plugin folder and manifest name mismatch', async () => {
  const root = await temporaryFramework()
  await addPlugin(root, 'studio', {
    name: 'canvas',
    version: '0.1.0',
    brain: '>=0.1.0 <0.2.0',
    description: 'Render artifacts.',
    dataRoot: 'Artifacts',
    skills: [],
  })

  const result = await validateFramework(root)

  assert.ok(result.errors.includes('Plugin folder "studio" must match manifest name "canvas"'))
})

test('reports duplicate provided capabilities across plugins', async () => {
  const root = await temporaryFramework()
  for (const name of ['studio', 'canvas']) {
    await addPlugin(root, name, {
      name,
      version: '0.1.0',
      brain: '>=0.1.0 <0.2.0',
      description: `Plugin ${name}.`,
      dataRoot: `Learning/${name}`,
      skills: [],
      provides: ['render:html'],
    })
  }

  const result = await validateFramework(root)

  assert.ok(
    result.errors.includes(
      'Capability "render:html" is provided by both "canvas" and "studio"',
    ),
  )
})

test('reports duplicate user-owned data roots across plugins', async () => {
  const root = await temporaryFramework()
  for (const name of ['chess', 'tactics']) {
    await addPlugin(root, name, {
      name,
      version: '0.1.0',
      brain: '>=0.1.0 <0.2.0',
      description: `Plugin ${name}.`,
      dataRoot: 'Learning/Chess',
      skills: [],
    })
  }

  const result = await validateFramework(root)

  assert.ok(
    result.errors.includes(
      'Data root "Learning/Chess" is declared by both "chess" and "tactics"',
    ),
  )
})

test('reports a missing framework descriptor', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'brain-validate-'))
  await Promise.all([
    writeFile(path.join(root, 'README.md'), '# Brain\n'),
    writeFile(path.join(root, 'AGENTS.md'), '# Agent contract\n'),
    writeFile(path.join(root, 'Brain.md'), '# Brain\n'),
  ])
  await addSkill(root, 'learn')

  const result = await validateFramework(root)

  assert.ok(result.errors.includes('Missing required root file: brain-framework.json'))
})

test('reports a branch-like framework descriptor version', async () => {
  const root = await temporaryFramework()
  await writeFile(
    path.join(root, 'brain-framework.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        name: 'brain-framework',
        repository: 'https://github.com/benteoh/brain-framework',
        version: 'main',
      },
      null,
      2,
    )}\n`,
  )

  const result = await validateFramework(root)

  assert.ok(
    result.errors.includes(
      'brain-framework.json version must be an exact release or commit, not a branch',
    ),
  )
})

test('reports a branch-like plugin version', async () => {
  const root = await temporaryFramework()
  await addPlugin(
    root,
    'studio',
    {
      name: 'studio',
      version: 'latest',
      brain: '>=0.1.0 <0.2.0',
      description: 'Render interactive artifacts.',
      dataRoot: 'Artifacts',
      skills: ['studio'],
    },
    ['studio'],
  )

  const result = await validateFramework(root)

  assert.ok(
    result.errors.includes('Plugin "studio" version must be an exact release or commit, not a branch'),
  )
})

test('reports a declared plugin skill missing from disk', async () => {
  const root = await temporaryFramework()
  await addPlugin(root, 'chess', {
    name: 'chess',
    version: '0.1.0',
    brain: '>=0.1.0 <0.2.0',
    description: 'Learn chess.',
    dataRoot: 'Learning/Chess',
    skills: ['chess-coach'],
  })

  const result = await validateFramework(root)

  assert.ok(
    result.errors.includes(
      'Plugin "chess" declares missing skill: skills/chess-coach/SKILL.md',
    ),
  )
})
