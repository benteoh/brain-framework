#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

function isWsl(env, readVersionFile) {
  if (env.WSL_DISTRO_NAME) return true
  try {
    return readVersionFile().toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

function toFileUrl(target) {
  return /^[a-z]+:\/\//i.test(target) ? target : `file://${path.resolve(target)}`
}

// Resolve which command actually opens `target` (a local path or a URL) in the
// default browser, per platform. Kept pure/injectable so it's testable without
// spawning a real process or depending on the real OS.
export function resolveOpener(
  target,
  {
    platform = process.platform,
    env = process.env,
    readVersionFile = () => readFileSync('/proc/version', 'utf8'),
    toWindowsPath = (linuxPath) => execFileSync('wslpath', ['-w', linuxPath]).toString().trim(),
  } = {},
) {
  const isUrl = /^[a-z]+:\/\//i.test(target)

  if (platform === 'darwin') return { command: 'open', args: [target] }
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '""', target] }

  if (platform === 'linux' && isWsl(env, readVersionFile)) {
    const windowsTarget = isUrl ? target : toWindowsPath(path.resolve(target))
    return { command: 'explorer.exe', args: [windowsTarget] }
  }

  return { command: 'xdg-open', args: [toFileUrl(target)] }
}

async function main(argv) {
  const target = argv[2]
  if (!target) {
    console.error('Usage: open.mjs <path-or-url>')
    process.exitCode = 1
    return
  }

  const { command, args } = resolveOpener(target)
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  // explorer.exe in particular routinely exits non-zero even on success; this
  // is a fire-and-forget launch, not a command whose exit code means anything.
  child.on('error', (error) => {
    console.error(`Could not open ${target}: ${error.message}`)
    process.exitCode = 1
  })
  child.unref()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv)
}
