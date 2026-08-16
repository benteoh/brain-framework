#!/usr/bin/env node

import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { syncClaudeCodeAdapter } from './lib/adapters.mjs'
import { addPlugin, getStatus, initInstance, syncInstance, updateInstance } from './lib/manage.mjs'
import { validateFramework } from './lib/validate.mjs'

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function usage() {
  return `Usage:
  brain.mjs validate [--root PATH]
  brain.mjs init --target PATH [--source PATH]
  brain.mjs sync --target PATH [--source PATH]
  brain.mjs update --to VERSION --target PATH [--source PATH]
  brain.mjs status --target PATH [--source PATH]
  brain.mjs plugin add NAME --target PATH [--source PATH]
  brain.mjs adapter claude-code --target PATH`
}

async function main(argv) {
  const [command, ...rest] = argv
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      root: { type: 'string' },
      source: { type: 'string' },
      target: { type: 'string' },
      to: { type: 'string' },
    },
    allowPositionals: true,
  })

  if (command === 'validate') {
    const root = path.resolve(values.root ?? sourceRoot)
    const result = await validateFramework(root)
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`)
    if (result.errors.length) {
      for (const error of result.errors) console.error(`Error: ${error}`)
      process.exitCode = 1
      return
    }
    console.log('Framework valid')
    return
  }

  if (command === 'init') {
    if (!values.target) throw new Error(`--target is required\n${usage()}`)
    const result = await initInstance({
      sourceRoot: path.resolve(values.source ?? sourceRoot),
      targetRoot: path.resolve(values.target),
    })
    if (result.status === 'conflict') {
      console.error(`Managed-file conflict:\n${result.conflicts.map((file) => `- ${file}`).join('\n')}`)
      process.exitCode = 2
      return
    }
    console.log(`${result.status}: ${result.files.length} managed files`)
    return
  }

  if (command === 'update') {
    if (!values.target) throw new Error(`--target is required\n${usage()}`)
    if (!values.to) throw new Error(`--to VERSION is required\n${usage()}`)
    const result = await updateInstance({
      sourceRoot: path.resolve(values.source ?? sourceRoot),
      targetRoot: path.resolve(values.target),
      toVersion: values.to,
    })
    if (result.status === 'conflict') {
      console.error(`Managed-file conflict:\n${result.conflicts.map((file) => `- ${file}`).join('\n')}`)
      process.exitCode = 2
      return
    }
    console.log(`${result.status}: ${result.files.length} managed files`)
    return
  }

  if (command === 'sync') {
    if (!values.target) throw new Error(`--target is required\n${usage()}`)
    const result = await syncInstance({
      sourceRoot: values.source ? path.resolve(values.source) : undefined,
      targetRoot: path.resolve(values.target),
    })
    if (result.status === 'conflict') {
      console.error(`Managed-file conflict:\n${result.conflicts.map((file) => `- ${file}`).join('\n')}`)
      process.exitCode = 2
      return
    }
    console.log(`${result.status}: ${result.files.length} managed files`)
    return
  }

  if (command === 'status') {
    if (!values.target) throw new Error(`--target is required\n${usage()}`)
    const result = await getStatus({
      sourceRoot: path.resolve(values.source ?? sourceRoot),
      targetRoot: path.resolve(values.target),
    })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (command === 'plugin' && positionals[0] === 'add') {
    const name = positionals[1]
    if (!name || !values.target) throw new Error(`Plugin name and --target are required\n${usage()}`)
    const result = await addPlugin({
      sourceRoot: path.resolve(values.source ?? sourceRoot),
      targetRoot: path.resolve(values.target),
      name,
    })
    if (result.status === 'conflict') {
      console.error(`Managed-file conflict:\n${result.conflicts.map((file) => `- ${file}`).join('\n')}`)
      process.exitCode = 2
      return
    }
    console.log(`${result.status}: ${result.files.length} managed files`)
    return
  }

  if (command === 'adapter' && positionals[0] === 'claude-code') {
    if (!values.target) throw new Error(`--target is required\n${usage()}`)
    const result = await syncClaudeCodeAdapter({ targetRoot: path.resolve(values.target) })
    if (result.conflicts.length) {
      console.error(`Adapter conflict:\n${result.conflicts.map((file) => `- ${file}`).join('\n')}`)
      process.exitCode = 2
      return
    }
    console.log(`created: ${result.created.length}, unchanged: ${result.unchanged.length}`)
    if (result.copied?.length) {
      console.log(`copied (symlink unsupported): ${result.copied.join(', ')}`)
    }
    return
  }

  throw new Error(`Unsupported command: ${command ?? '(missing)'}\n${usage()}`)
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
