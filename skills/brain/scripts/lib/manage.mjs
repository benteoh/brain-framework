import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  MANAGED_FILES_PATH,
  MANIFEST_PATH,
  ensureDependencyIgnoreBlock,
  previewDependencyIgnoreBlock,
  writeLocalState,
} from './instance-state.mjs'
import { createManifest, readFrameworkDescriptor, readManifest, writeManifest } from './manifest.mjs'

function portable(relativePath) {
  return relativePath.split(path.sep).join('/')
}

async function exists(file) {
  try {
    await stat(file)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

async function walkFiles(root, current = root) {
  const result = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'tests') continue
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) result.push(...(await walkFiles(root, absolute)))
    else if (entry.isFile()) result.push(portable(path.relative(root, absolute)))
  }
  return result.sort()
}

async function coreFiles(sourceRoot) {
  const files = ['AGENTS.md']
  const skillsRoot = path.join(sourceRoot, 'skills')
  if (await exists(skillsRoot)) {
    for (const relative of await walkFiles(skillsRoot)) {
      files.push(`skills/${relative}`)
    }
  }
  return files.sort()
}

async function pluginFiles(sourceRoot, name) {
  const pluginRoot = path.join(sourceRoot, 'plugins', name)
  if (!(await exists(path.join(pluginRoot, 'brain-plugin.json')))) {
    throw new Error(`Unknown plugin: ${name}`)
  }
  return (await walkFiles(pluginRoot)).map((relative) => `plugins/${name}/${relative}`)
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function readManagedFiles(targetRoot) {
  const file = path.join(targetRoot, MANAGED_FILES_PATH)
  const value = await readJsonIfExists(file)
  if (!value) {
    throw new Error(`Missing installed dependency metadata: ${file}. Run "brain init" first.`)
  }
  return value
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

async function copyManagedFiles(sourceRoot, targetRoot, files) {
  for (const relative of files) {
    const destination = path.join(targetRoot, relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(path.join(sourceRoot, relative), destination)
  }
}

async function checksums(root, files) {
  return Object.fromEntries(
    await Promise.all(files.map(async (relative) => [relative, await sha256(path.join(root, relative))])),
  )
}

export async function initInstance({ sourceRoot, targetRoot }) {
  sourceRoot = path.resolve(sourceRoot)
  targetRoot = path.resolve(targetRoot)
  await mkdir(targetRoot, { recursive: true })

  const manifestExists = await exists(path.join(targetRoot, MANIFEST_PATH))
  const managedFilesRaw = await readJsonIfExists(path.join(targetRoot, MANAGED_FILES_PATH))
  const isMigratedMetadata = Boolean(managedFilesRaw) && managedFilesRaw.schemaVersion === 1
  const legacyMetadata =
    managedFilesRaw && !isMigratedMetadata && managedFilesRaw.version === 1 ? managedFilesRaw : null

  if (manifestExists && isMigratedMetadata) {
    return updateInstance({ sourceRoot, targetRoot })
  }

  const descriptor = await readFrameworkDescriptor(sourceRoot)
  const sourceFiles = await coreFiles(sourceRoot)
  const legacyFiles = legacyMetadata?.files ?? {}
  const ignoredFiles = []
  const filesToInstall = []
  const conflicts = []

  for (const relative of sourceFiles) {
    const destinationExists = await exists(path.join(targetRoot, relative))
    if (relative === 'AGENTS.md' && destinationExists) {
      ignoredFiles.push(relative)
    } else if (legacyFiles[relative]) {
      // Already installed and checksum-tracked by the legacy manager; carry it forward
      // without reinstalling or discarding checksum ownership.
    } else if (destinationExists) {
      conflicts.push(relative)
    } else {
      filesToInstall.push(relative)
    }
  }

  const ignorePreview = await previewDependencyIgnoreBlock(targetRoot)
  if (ignorePreview.status === 'conflict') {
    conflicts.push(...ignorePreview.conflicts.map((rule) => `.gitignore:${rule}`))
  }

  if (conflicts.length) return { status: 'conflict', conflicts: conflicts.sort() }

  const brainDestination = path.join(targetRoot, 'Brain.md')
  const shouldSeedBrain = !(await exists(brainDestination))
  await copyManagedFiles(sourceRoot, targetRoot, filesToInstall)
  if (shouldSeedBrain) await copyFile(path.join(sourceRoot, 'Brain.md'), brainDestination)
  await ensureDependencyIgnoreBlock(targetRoot)

  let manifest
  if (manifestExists) {
    manifest = await readManifest(targetRoot)
  } else {
    manifest = createManifest(descriptor)
    if (legacyMetadata?.plugins) {
      manifest.plugins = Object.entries(legacyMetadata.plugins).map(([name, info]) => ({
        name,
        version: info.version,
      }))
    }
    await writeManifest(targetRoot, manifest)
  }

  const metadata = {
    schemaVersion: 1,
    frameworkVersion: descriptor.version,
    files: {
      ...legacyFiles,
      ...(await checksums(targetRoot, filesToInstall)),
    },
    ignoredFiles,
    plugins: legacyMetadata?.plugins ?? {},
  }
  await writeJson(path.join(targetRoot, MANAGED_FILES_PATH), metadata)
  await writeLocalState(targetRoot, { sourceRoot })

  return { status: 'installed', files: filesToInstall }
}

export async function updateInstance({ sourceRoot, targetRoot }) {
  sourceRoot = path.resolve(sourceRoot)
  targetRoot = path.resolve(targetRoot)
  const metadata = await readManagedFiles(targetRoot)
  const descriptor = await readFrameworkDescriptor(sourceRoot)
  const sourceFiles = await coreFiles(sourceRoot)
  for (const name of Object.keys(metadata.plugins ?? {}).sort()) {
    sourceFiles.push(...(await pluginFiles(sourceRoot, name)))
  }
  sourceFiles.sort()
  const ignored = new Set(metadata.ignoredFiles ?? [])
  const conflicts = []
  const filesToUpdate = []

  for (const relative of sourceFiles) {
    if (ignored.has(relative)) continue
    const destination = path.join(targetRoot, relative)
    const installedChecksum = metadata.files[relative]
    if (installedChecksum) {
      if (!(await exists(destination)) || (await sha256(destination)) !== installedChecksum) {
        conflicts.push(relative)
      } else if ((await sha256(path.join(sourceRoot, relative))) !== installedChecksum) {
        filesToUpdate.push(relative)
      }
    } else if (await exists(destination)) {
      conflicts.push(relative)
    } else {
      filesToUpdate.push(relative)
    }
  }

  if (conflicts.length) return { status: 'conflict', conflicts: conflicts.sort() }

  await copyManagedFiles(sourceRoot, targetRoot, filesToUpdate)
  metadata.schemaVersion = 1
  metadata.frameworkVersion = descriptor.version
  metadata.files = {
    ...metadata.files,
    ...(await checksums(targetRoot, filesToUpdate)),
  }
  await writeJson(path.join(targetRoot, MANAGED_FILES_PATH), metadata)
  await writeLocalState(targetRoot, { sourceRoot })

  return { status: filesToUpdate.length ? 'updated' : 'unchanged', files: filesToUpdate }
}

export async function addPlugin({ sourceRoot, targetRoot, name }) {
  sourceRoot = path.resolve(sourceRoot)
  targetRoot = path.resolve(targetRoot)
  const metadata = await readManagedFiles(targetRoot)
  const files = await pluginFiles(sourceRoot, name)

  if (metadata.plugins?.[name]) {
    return updateInstance({ sourceRoot, targetRoot })
  }

  const conflicts = []
  for (const relative of files) {
    if (await exists(path.join(targetRoot, relative))) conflicts.push(relative)
  }
  if (conflicts.length) return { status: 'conflict', conflicts: conflicts.sort() }

  const manifest = JSON.parse(
    await readFile(path.join(sourceRoot, 'plugins', name, 'brain-plugin.json'), 'utf8'),
  )
  await copyManagedFiles(sourceRoot, targetRoot, files)
  metadata.files = { ...metadata.files, ...(await checksums(targetRoot, files)) }
  metadata.plugins ??= {}
  metadata.plugins[name] = { version: manifest.version }
  await writeJson(path.join(targetRoot, MANAGED_FILES_PATH), metadata)

  return { status: 'installed', files }
}

export async function getStatus({ sourceRoot, targetRoot }) {
  sourceRoot = path.resolve(sourceRoot)
  targetRoot = path.resolve(targetRoot)
  const metadata = await readManagedFiles(targetRoot)
  const enabledPlugins = Object.keys(metadata.plugins ?? {}).sort()
  const provided = new Set()
  const manifests = new Map()

  for (const name of enabledPlugins) {
    const manifest = JSON.parse(
      await readFile(path.join(targetRoot, 'plugins', name, 'brain-plugin.json'), 'utf8'),
    )
    manifests.set(name, manifest)
    for (const capability of manifest.provides ?? []) provided.add(capability)
  }

  const missingOptionalCapabilities = {}
  for (const [name, manifest] of manifests) {
    const missing = (manifest.uses?.optional ?? []).filter((capability) => !provided.has(capability))
    if (missing.length) missingOptionalCapabilities[name] = missing.sort()
  }

  return {
    source: sourceRoot,
    enabledPlugins,
    managedFiles: Object.keys(metadata.files).length,
    providedCapabilities: [...provided].sort(),
    missingOptionalCapabilities,
  }
}
