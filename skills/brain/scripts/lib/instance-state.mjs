import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MANIFEST_PATH = path.join('.brain', 'manifest.json')
export const LOCAL_STATE_PATH = path.join('.brain', 'local.json')
export const MANAGED_FILES_PATH = path.join('.brain', 'managed-files.json')

const IGNORE_BLOCK =
  '# Brain managed dependencies\n/skills/\n/plugins/\n/.brain/local.json\n/.brain/managed-files.json\n'
const IGNORE_DATA_LINES = IGNORE_BLOCK.trimEnd()
  .split('\n')
  .filter((line) => !line.startsWith('#'))

async function computeIgnoreBlockPlan(targetRoot) {
  const file = path.join(targetRoot, '.gitignore')
  let raw = ''
  let fileExisted = true
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    fileExisted = false
  }

  if (raw.includes(IGNORE_BLOCK)) {
    return { status: 'unchanged' }
  }

  const existingLines = new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )
  const conflicts = IGNORE_DATA_LINES.filter((line) => existingLines.has(line))
  if (conflicts.length) {
    return { status: 'conflict', conflicts }
  }

  return {
    status: fileExisted ? 'appended' : 'created',
    async write() {
      let updated = raw
      if (updated && !updated.endsWith('\n')) updated += '\n'
      updated += IGNORE_BLOCK
      await writeFile(file, updated)
    },
  }
}

// Read-only check: reports whether appending the block would succeed or conflict,
// without writing anything. Used to preflight collisions before any writes occur.
export async function previewDependencyIgnoreBlock(targetRoot) {
  const plan = await computeIgnoreBlockPlan(targetRoot)
  return { status: plan.status, conflicts: plan.conflicts }
}

export async function ensureDependencyIgnoreBlock(targetRoot) {
  const plan = await computeIgnoreBlockPlan(targetRoot)
  if (plan.status === 'conflict' || plan.status === 'unchanged') {
    return { status: plan.status, conflicts: plan.conflicts }
  }
  await plan.write()
  return { status: plan.status }
}

export async function readLocalState(targetRoot) {
  const file = path.join(targetRoot, LOCAL_STATE_PATH)
  return JSON.parse(await readFile(file, 'utf8'))
}

export async function writeLocalState(targetRoot, { sourceRoot }) {
  const file = path.join(targetRoot, LOCAL_STATE_PATH)
  const value = {
    schemaVersion: 1,
    sourceRoot: path.resolve(sourceRoot),
  }
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = path.join(path.dirname(file), `.local-${randomUUID()}.json.tmp`)
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporary, file)
  return value
}
