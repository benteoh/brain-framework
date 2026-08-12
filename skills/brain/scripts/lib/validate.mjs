import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const REQUIRED_ROOT_FILES = ['README.md', 'AGENTS.md', 'Brain.md']
const REQUIRED_PLUGIN_FIELDS = [
  'name',
  'version',
  'brain',
  'description',
  'dataRoot',
  'skills',
]

async function directoryNames(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function regularFile(file) {
  try {
    return (await stat(file)).isFile()
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function parseSkillFrontmatter(content, relativePath, errors) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) {
    errors.push(`Skill ${relativePath} is missing YAML frontmatter`)
    return
  }

  const fields = new Map()
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.+)$/)
    if (field) fields.set(field[1], field[2].trim())
  }
  for (const required of ['name', 'description']) {
    if (!fields.get(required)) {
      errors.push(`Skill ${relativePath} is missing frontmatter field: ${required}`)
    }
  }
}

async function validateSkill(file, root, errors) {
  const relativePath = path.relative(root, file).split(path.sep).join('/')
  if (!(await regularFile(file))) {
    errors.push(`Missing skill file: ${relativePath}`)
    return
  }
  parseSkillFrontmatter(await readFile(file, 'utf8'), relativePath, errors)
}

async function validatePlugin(root, folder, capabilities, dataRoots, errors) {
  const pluginRoot = path.join(root, 'plugins', folder)
  const manifestFile = path.join(pluginRoot, 'brain-plugin.json')
  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  } catch (error) {
    errors.push(
      error.code === 'ENOENT'
        ? `Plugin "${folder}" is missing brain-plugin.json`
        : `Plugin "${folder}" has invalid brain-plugin.json: ${error.message}`,
    )
    return
  }

  for (const field of REQUIRED_PLUGIN_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === '') {
      errors.push(`Plugin "${folder}" is missing manifest field: ${field}`)
    }
  }
  if (!Array.isArray(manifest.skills)) {
    errors.push(`Plugin "${folder}" manifest field "skills" must be an array`)
    return
  }
  if (manifest.name && manifest.name !== folder) {
    errors.push(`Plugin folder "${folder}" must match manifest name "${manifest.name}"`)
  }

  if (typeof manifest.dataRoot === 'string' && manifest.dataRoot) {
    const previous = dataRoots.get(manifest.dataRoot)
    if (previous) {
      errors.push(
        `Data root "${manifest.dataRoot}" is declared by both "${previous}" and "${folder}"`,
      )
    } else {
      dataRoots.set(manifest.dataRoot, folder)
    }
  }

  for (const capability of manifest.provides ?? []) {
    const previous = capabilities.get(capability)
    if (previous) {
      errors.push(
        `Capability "${capability}" is provided by both "${previous}" and "${folder}"`,
      )
    } else {
      capabilities.set(capability, folder)
    }
  }

  for (const skill of manifest.skills) {
    const relativeSkill = `skills/${skill}/SKILL.md`
    const skillFile = path.join(pluginRoot, relativeSkill)
    if (!(await regularFile(skillFile))) {
      errors.push(`Plugin "${folder}" declares missing skill: ${relativeSkill}`)
    } else {
      await validateSkill(skillFile, root, errors)
    }
  }
}

export async function validateFramework(root) {
  const errors = []
  const warnings = []

  for (const relativeFile of REQUIRED_ROOT_FILES) {
    const file = path.join(root, relativeFile)
    try {
      if (!(await readFile(file, 'utf8')).trim()) {
        errors.push(`Required root file is empty: ${relativeFile}`)
      }
    } catch (error) {
      if (error.code === 'ENOENT') errors.push(`Missing required root file: ${relativeFile}`)
      else throw error
    }
  }

  for (const skill of await directoryNames(path.join(root, 'skills'))) {
    await validateSkill(path.join(root, 'skills', skill, 'SKILL.md'), root, errors)
  }

  const capabilities = new Map()
  const dataRoots = new Map()
  for (const plugin of await directoryNames(path.join(root, 'plugins'))) {
    await validatePlugin(root, plugin, capabilities, dataRoots, errors)
  }

  return { errors, warnings }
}
