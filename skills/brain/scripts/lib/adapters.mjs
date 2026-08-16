import { copyFile, lstat, mkdir, readdir, readFile, readlink, stat, symlink } from 'node:fs/promises'
import path from 'node:path'

import { readManagedFiles } from './manage.mjs'
import { readManifest } from './manifest.mjs'

// Core skills that are learning capabilities an agent invokes mid-conversation. `brain` itself
// is the manager, not a learning skill, so it is never adapted.
const SKIPPED_CORE_SKILLS = new Set(['brain'])

async function exists(file) {
  try {
    await stat(file)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function listSkillDirectories(skillsRoot) {
  if (!(await exists(skillsRoot))) return []
  const names = []
  for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (await exists(path.join(skillsRoot, entry.name, 'SKILL.md'))) names.push(entry.name)
  }
  return names.sort()
}

// Files a copy-fallback installs, and therefore the files a copy-fallback match is judged
// against: SKILL.md plus a references/ directory when the skill has one.
async function copyableFiles(sourceDir) {
  const files = ['SKILL.md']
  const referencesDir = path.join(sourceDir, 'references')
  if (await exists(referencesDir)) {
    for (const relative of await walkFlat(referencesDir)) {
      files.push(path.join('references', relative))
    }
  }
  return files
}

async function walkFlat(root, current = root) {
  const result = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await walkFlat(root, absolute)))
    } else if (entry.isFile()) {
      result.push(path.relative(root, absolute))
    }
  }
  return result
}

// Adapter naming: a plugin's single skill that already shares the plugin's own directory name
// (e.g. studio's "studio" skill) adapts bare — the prefix would be redundant. Every other plugin
// skill (in practice: a plugin with more than one skill, like coach's chess/language) adapts as
// `<plugin>-<skill>` so its origin is unambiguous and it can never collide with an unrelated
// future skill of the same bare name. A residual global collision (against core skill names or
// an earlier plugin's bare name) always forces the prefixed form as a last-resort disambiguator.
function planAdapterEntries(coreSkillNames, plugins) {
  const entries = []
  const reserved = new Set()

  for (const name of coreSkillNames) {
    entries.push({ adapterName: name, sourceKind: 'core', skill: name })
    reserved.add(name)
  }

  for (const plugin of plugins) {
    const selfNamed = plugin.skills.length === 1 && plugin.skills[0] === plugin.name
    for (const skill of plugin.skills) {
      let adapterName = selfNamed ? skill : `${plugin.name}-${skill}`
      if (reserved.has(adapterName)) adapterName = `${plugin.name}-${skill}`
      reserved.add(adapterName)
      entries.push({ adapterName, sourceKind: 'plugin', plugin: plugin.name, skill })
    }
  }

  return entries
}

async function copyMatchesSource(destinationDir, sourceDir) {
  for (const relative of await copyableFiles(sourceDir)) {
    const destinationFile = path.join(destinationDir, relative)
    if (!(await exists(destinationFile))) return false
    const [installed, source] = await Promise.all([
      readFile(destinationFile),
      readFile(path.join(sourceDir, relative)),
    ])
    if (!installed.equals(source)) return false
  }
  return true
}

async function classifyExisting(linkPath, sourceDir) {
  let stats
  try {
    stats = await lstat(linkPath)
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing'
    throw error
  }

  if (stats.isSymbolicLink()) {
    const target = await readlink(linkPath)
    const resolved = path.resolve(path.dirname(linkPath), target)
    return resolved === path.resolve(sourceDir) ? 'unchanged' : 'conflict'
  }

  if (stats.isDirectory()) {
    return (await copyMatchesSource(linkPath, sourceDir)) ? 'unchanged' : 'conflict'
  }

  return 'conflict'
}

async function createAdapter(linkPath, sourceDir) {
  await mkdir(path.dirname(linkPath), { recursive: true })
  const relativeTarget = path.relative(path.dirname(linkPath), sourceDir)
  try {
    await symlink(relativeTarget, linkPath, 'dir')
    return 'symlink'
  } catch {
    // Platform doesn't support symlink creation (or it failed for another reason): fall back to
    // a plain directory copy of just SKILL.md and references/, matching what classifyExisting
    // checks for on a later run.
    await mkdir(linkPath, { recursive: true })
    for (const relative of await copyableFiles(sourceDir)) {
      const destinationFile = path.join(linkPath, relative)
      await mkdir(path.dirname(destinationFile), { recursive: true })
      await copyFile(path.join(sourceDir, relative), destinationFile)
    }
    return 'copy'
  }
}

export async function syncClaudeCodeAdapter({ targetRoot }) {
  targetRoot = path.resolve(targetRoot)

  const manifest = await readManifest(targetRoot)
  // Confirms the instance is actually initialised (throws a "Run brain init first" style error
  // otherwise) and gives us the installed-file inventory, matching the manager's own idiom.
  await readManagedFiles(targetRoot)

  const coreSkillNames = (await listSkillDirectories(path.join(targetRoot, 'skills'))).filter(
    (name) => !SKIPPED_CORE_SKILLS.has(name),
  )

  const plugins = []
  for (const plugin of manifest.plugins) {
    const skills = await listSkillDirectories(path.join(targetRoot, 'plugins', plugin.name, 'skills'))
    plugins.push({ name: plugin.name, skills })
  }

  const claudeSkillsRoot = path.join(targetRoot, '.claude', 'skills')
  const plan = planAdapterEntries(coreSkillNames, plugins).map((entry) => {
    const sourceDir =
      entry.sourceKind === 'core'
        ? path.join(targetRoot, 'skills', entry.skill)
        : path.join(targetRoot, 'plugins', entry.plugin, 'skills', entry.skill)
    return { adapterName: entry.adapterName, sourceDir, linkPath: path.join(claudeSkillsRoot, entry.adapterName) }
  })

  const unchanged = []
  const conflicts = []
  const toCreate = []

  for (const entry of plan) {
    const classification = await classifyExisting(entry.linkPath, entry.sourceDir)
    if (classification === 'missing') toCreate.push(entry)
    else if (classification === 'conflict') conflicts.push(entry.adapterName)
    else unchanged.push(entry.adapterName)
  }

  if (conflicts.length) {
    return { created: [], unchanged: unchanged.sort(), conflicts: conflicts.sort() }
  }

  const created = []
  const copied = []
  for (const entry of toCreate) {
    const method = await createAdapter(entry.linkPath, entry.sourceDir)
    created.push(entry.adapterName)
    if (method === 'copy') copied.push(entry.adapterName)
  }

  const result = { created: created.sort(), unchanged: unchanged.sort(), conflicts: [] }
  if (copied.length) result.copied = copied.sort()
  return result
}
