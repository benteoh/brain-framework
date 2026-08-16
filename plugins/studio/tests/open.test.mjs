import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveOpener } from '../scripts/open.mjs'

test('opens with "open" on macOS', () => {
  const result = resolveOpener('/tmp/lesson.html', { platform: 'darwin' })
  assert.deepEqual(result, { command: 'open', args: ['/tmp/lesson.html'] })
})

test('opens with cmd/start on Windows', () => {
  const result = resolveOpener('C:\\lesson.html', { platform: 'win32' })
  assert.deepEqual(result, { command: 'cmd', args: ['/c', 'start', '""', 'C:\\lesson.html'] })
})

test('opens with xdg-open as a file:// URL on plain Linux', () => {
  const result = resolveOpener('/tmp/lesson.html', {
    platform: 'linux',
    env: {},
    readVersionFile: () => 'Linux version 6.6.0-generic',
  })
  assert.deepEqual(result, { command: 'xdg-open', args: ['file:///tmp/lesson.html'] })
})

test('detects WSL via WSL_DISTRO_NAME and opens through explorer.exe with a translated path', () => {
  const result = resolveOpener('/home/ben/lesson.html', {
    platform: 'linux',
    env: { WSL_DISTRO_NAME: 'Ubuntu' },
    readVersionFile: () => 'Linux version 6.6.0-generic',
    toWindowsPath: (linuxPath) => `\\\\wsl.localhost\\Ubuntu${linuxPath.replace(/\//g, '\\')}`,
  })
  assert.deepEqual(result, {
    command: 'explorer.exe',
    args: ['\\\\wsl.localhost\\Ubuntu\\home\\ben\\lesson.html'],
  })
})

test('detects WSL via /proc/version when WSL_DISTRO_NAME is unset', () => {
  const result = resolveOpener('/home/ben/lesson.html', {
    platform: 'linux',
    env: {},
    readVersionFile: () => 'Linux version 6.6.87.2-microsoft-standard-WSL2',
    toWindowsPath: () => '\\\\wsl.localhost\\Ubuntu\\home\\ben\\lesson.html',
  })
  assert.equal(result.command, 'explorer.exe')
})

test('passes a URL straight through under WSL without path translation', () => {
  let translateCalled = false
  const result = resolveOpener('http://localhost:4387/session', {
    platform: 'linux',
    env: { WSL_DISTRO_NAME: 'Ubuntu' },
    readVersionFile: () => 'Linux version 6.6.0-microsoft',
    toWindowsPath: () => {
      translateCalled = true
      return 'unused'
    },
  })
  assert.equal(translateCalled, false)
  assert.deepEqual(result, { command: 'explorer.exe', args: ['http://localhost:4387/session'] })
})

test('falls back to plain Linux behavior when /proc/version is unreadable', () => {
  const result = resolveOpener('/tmp/lesson.html', {
    platform: 'linux',
    env: {},
    readVersionFile: () => {
      throw new Error('ENOENT')
    },
  })
  assert.equal(result.command, 'xdg-open')
})
