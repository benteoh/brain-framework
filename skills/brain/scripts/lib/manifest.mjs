import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DESCRIPTOR_ALLOWED_KEYS = ['name', 'repository', 'schemaVersion', 'version']
const MANIFEST_ALLOWED_KEYS = ['framework', 'plugins', 'schemaVersion']
const FRAMEWORK_ALLOWED_KEYS = ['repository', 'version']
const PLUGIN_ALLOWED_KEYS = ['name', 'version']

// Exact semantic version with an optional dot-separated prerelease, e.g. 0.1.0 or 0.1.0-alpha.1.
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$/
// 40-character lowercase Git commit hash.
const COMMIT_HASH_PATTERN = /^[0-9a-f]{40}$/

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unknownKeyErrors(value, allowedKeys, label) {
  const errors = []
  for (const key of Object.keys(value ?? {}).sort()) {
    if (!allowedKeys.includes(key)) errors.push(`${label} has unknown field: ${key}`)
  }
  return errors
}

export function isExactVersion(value) {
  return typeof value === 'string' && (EXACT_VERSION_PATTERN.test(value) || COMMIT_HASH_PATTERN.test(value))
}

export function validateFrameworkDescriptor(value) {
  if (!isPlainObject(value)) {
    return { errors: ['brain-framework.json must be a JSON object'] }
  }

  const errors = unknownKeyErrors(value, DESCRIPTOR_ALLOWED_KEYS, 'brain-framework.json')
  if (value.schemaVersion !== 1) errors.push('brain-framework.json schemaVersion must be 1')
  if (typeof value.name !== 'string' || !value.name) {
    errors.push('brain-framework.json is missing field: name')
  }
  if (typeof value.repository !== 'string' || !/^https:\/\//.test(value.repository)) {
    errors.push('brain-framework.json repository must be an https URL')
  }
  if (!isExactVersion(value.version)) {
    errors.push('brain-framework.json version must be an exact release or commit, not a branch')
  }
  return { errors }
}

export async function readFrameworkDescriptor(sourceRoot) {
  const file = path.join(sourceRoot, 'brain-framework.json')
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing framework descriptor: ${file}`)
    throw error
  }

  let value
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid framework descriptor JSON: ${file}: ${error.message}`)
  }

  const { errors } = validateFrameworkDescriptor(value)
  if (errors.length) {
    throw new Error(`Invalid framework descriptor:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  }
  return value
}

export function validateManifest(value) {
  if (!isPlainObject(value)) {
    return { errors: ['manifest must be a JSON object'] }
  }

  const errors = unknownKeyErrors(value, MANIFEST_ALLOWED_KEYS, 'manifest')
  if (value.schemaVersion !== 1) errors.push('manifest schemaVersion must be 1')

  const framework = value.framework
  if (!isPlainObject(framework)) {
    errors.push('manifest is missing object field: framework')
  } else {
    errors.push(...unknownKeyErrors(framework, FRAMEWORK_ALLOWED_KEYS, 'manifest.framework'))
    if (typeof framework.repository !== 'string' || !/^https:\/\//.test(framework.repository)) {
      errors.push('manifest.framework.repository must be an https URL')
    }
    if (!isExactVersion(framework.version)) {
      errors.push('manifest.framework.version must be an exact release or commit, not a branch')
    }
  }

  const plugins = value.plugins
  if (!Array.isArray(plugins)) {
    errors.push('manifest is missing array field: plugins')
  } else {
    const seenNames = new Set()
    let previousName = null
    plugins.forEach((plugin, index) => {
      const label = `manifest.plugins[${index}]`
      if (!isPlainObject(plugin)) {
        errors.push(`${label} must be an object`)
        return
      }

      errors.push(...unknownKeyErrors(plugin, PLUGIN_ALLOWED_KEYS, label))

      if (typeof plugin.name !== 'string' || !plugin.name) {
        errors.push(`${label}.name must be a non-empty string`)
      } else {
        if (seenNames.has(plugin.name)) {
          errors.push(`manifest.plugins declares duplicate name: ${plugin.name}`)
        }
        seenNames.add(plugin.name)
        if (previousName !== null && plugin.name < previousName) {
          errors.push('manifest.plugins must be sorted by name')
        }
        previousName = plugin.name
      }

      if (!isExactVersion(plugin.version)) {
        errors.push(`${label}.version must be an exact release or commit, not a branch`)
      }
    })
  }

  return { errors }
}

export function createManifest(descriptor) {
  const { errors } = validateFrameworkDescriptor(descriptor)
  if (errors.length) {
    throw new Error(
      `Cannot create a Brain manifest from an invalid framework descriptor:\n${errors
        .map((error) => `- ${error}`)
        .join('\n')}`,
    )
  }
  return {
    schemaVersion: 1,
    framework: {
      repository: descriptor.repository,
      version: descriptor.version,
    },
    plugins: [],
  }
}

function manifestFile(targetRoot) {
  return path.join(targetRoot, '.brain', 'manifest.json')
}

export async function readManifest(targetRoot) {
  const file = manifestFile(targetRoot)
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Missing Brain manifest: ${file}. Run "brain init" to create it.`)
    }
    throw error
  }

  let value
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid manifest JSON: ${file}: ${error.message}`)
  }

  const { errors } = validateManifest(value)
  if (errors.length) {
    throw new Error(`Invalid Brain manifest:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  }
  return value
}

export async function writeManifest(targetRoot, manifest) {
  const sorted = {
    ...manifest,
    plugins: Array.isArray(manifest.plugins)
      ? [...manifest.plugins].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      : manifest.plugins,
  }

  const { errors } = validateManifest(sorted)
  if (errors.length) {
    throw new Error(`Cannot write an invalid Brain manifest:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  }

  const file = manifestFile(targetRoot)
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = path.join(path.dirname(file), `.manifest-${randomUUID()}.json.tmp`)
  await writeFile(temporary, `${JSON.stringify(sorted, null, 2)}\n`)
  await rename(temporary, file)
}
