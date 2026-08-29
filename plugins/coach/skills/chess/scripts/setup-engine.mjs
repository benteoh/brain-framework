#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { parseArgs } from 'node:util'
import { defaultVendorDir, ENGINE_PACKAGE, ENGINE_VERSION, engineFlavourPath, openEngine } from './lib/engine.mjs'

const run = promisify(execFile)

// Stockfish is installed rather than vendored into the framework repo for two
// reasons: it is GPL-3.0 (the rest of this repo is not), and the published
// package is 240 MB. Both full-net builds are pruned after install; the lite
// builds are 7 MB each and are what we actually run.
const PRUNE = [
  'bin/stockfish-18.wasm',
  'bin/stockfish-18-single.wasm',
  'bin/stockfish-18-asm.js',
]

async function exists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

async function install(vendorDir) {
  await mkdir(vendorDir, { recursive: true })
  // npm refuses to install into a directory with no package.json of its own.
  const manifest = path.join(vendorDir, 'package.json')
  if (!(await exists(manifest))) {
    await writeFile(manifest, `${JSON.stringify({ name: 'brain-vendor', private: true }, null, 2)}\n`)
  }
  console.log(`Installing ${ENGINE_PACKAGE}@${ENGINE_VERSION} and chess.js into ${vendorDir} ...`)
  await run('npm', ['install', `${ENGINE_PACKAGE}@${ENGINE_VERSION}`, 'chess.js@1.4.0', '--no-save', '--no-audit', '--no-fund'], {
    cwd: vendorDir,
    maxBuffer: 32 * 1024 * 1024,
  })
}

async function prune(vendorDir) {
  const root = path.join(vendorDir, 'node_modules', ENGINE_PACKAGE)
  let freed = 0
  for (const relative of PRUNE) {
    const target = path.join(root, relative)
    try {
      freed += (await stat(target)).size
      await rm(target, { force: true })
    } catch {
      // Already pruned, or this build of the package never shipped it.
    }
  }
  if (freed) console.log(`Pruned ${(freed / 1024 / 1024).toFixed(0)} MB of unused full-net builds.`)
}

async function verify(vendorDir) {
  const engine = await openEngine({ vendorDir, flavour: 'lite', threads: 1 })
  try {
    const banner = await engine.id()
    const probe = await engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 8 })
    console.log(`Engine OK: ${banner}`)
    console.log(`  startpos depth ${probe.depth} -> ${probe.bestMove} (${probe.evalCp} cp, white-relative)`)
    return banner
  } finally {
    await engine.quit()
  }
}

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { vendor: { type: 'string' } } })
  const vendorDir = path.resolve(values.vendor ?? defaultVendorDir())

  const already = await exists(engineFlavourPath(vendorDir, 'lite'))
  if (already) console.log(`Engine already present in ${vendorDir}; verifying.`)
  else await install(vendorDir)
  await prune(vendorDir)

  const banner = await verify(vendorDir)

  const stamp = path.join(vendorDir, 'engine.json')
  await writeFile(
    stamp,
    `${JSON.stringify({ package: ENGINE_PACKAGE, version: ENGINE_VERSION, banner, installedAt: new Date().toISOString() }, null, 2)}\n`,
  )
  console.log(`Wrote ${stamp}`)

  const gitignore = path.join(path.dirname(vendorDir), '.gitignore')
  if (!(await exists(gitignore))) {
    await writeFile(gitignore, 'vendor/\n')
  } else {
    const current = await readFile(gitignore, 'utf8')
    if (!current.split('\n').some((line) => line.trim() === 'vendor/')) {
      await writeFile(gitignore, `${current.replace(/\n*$/, '\n')}vendor/\n`)
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
