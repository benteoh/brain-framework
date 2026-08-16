import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createStudioServer } from '../scripts/serve.mjs'
import { main } from '../scripts/update.mjs'

async function withServer(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'studio-update-'))
  const htmlPath = path.join(dir, 'exercise.html')
  const transcriptPath = path.join(dir, 'transcript.jsonl')
  await writeFile(htmlPath, '<p>ciao</p>')

  const server = createStudioServer({ htmlPath, transcriptPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    return new Promise((resolve) => server.close(resolve))
  })
  const { port } = server.address()
  return { port }
}

test('replaces the server state, reflected by GET /state', async (t) => {
  const { port } = await withServer(t)

  await main(['--port', String(port), '--data', '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}'])

  const state = await (await fetch(`http://127.0.0.1:${port}/state`)).json()
  assert.deepEqual(state, { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' })
})

test('missing --data exits with an error and sends nothing', async (t) => {
  const { port } = await withServer(t)
  const originalExitCode = process.exitCode

  await main(['--port', String(port)])
  const exitCode = process.exitCode
  process.exitCode = originalExitCode

  assert.equal(exitCode, 1)
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/state`)).json(), {})
})

test('invalid JSON in --data exits with an error and sends nothing', async (t) => {
  const { port } = await withServer(t)
  const originalExitCode = process.exitCode

  await main(['--port', String(port), '--data', 'not json'])
  const exitCode = process.exitCode
  process.exitCode = originalExitCode

  assert.equal(exitCode, 1)
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/state`)).json(), {})
})

test('a server that is not running is reported as a failure via exitCode, not a thrown error', async (t) => {
  const originalExitCode = process.exitCode

  await assert.doesNotReject(() => main(['--port', '1', '--data', '{}']))
  const exitCode = process.exitCode
  process.exitCode = originalExitCode

  assert.notEqual(exitCode, 0)
})
