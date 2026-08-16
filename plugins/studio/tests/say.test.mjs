import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createStudioServer } from '../scripts/serve.mjs'
import { main } from '../scripts/say.mjs'

async function withServer(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'studio-say-'))
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

test('posts an agent message to a running server, recorded and returned via /transcript', async (t) => {
  const { port } = await withServer(t)

  await main(['--port', String(port), '--text', 'Almost — o means or, not and.'])

  const transcript = await (
    await fetch(`http://127.0.0.1:${port}/transcript`)
  ).json()
  assert.equal(transcript.length, 1)
  assert.equal(transcript[0].role, 'agent')
  assert.equal(transcript[0].text, 'Almost — o means or, not and.')
})

test('missing --text exits with an error and sends nothing', async (t) => {
  const { port } = await withServer(t)
  const originalExitCode = process.exitCode

  await main(['--port', String(port)])
  const exitCode = process.exitCode
  process.exitCode = originalExitCode

  assert.equal(exitCode, 1)
  const transcript = await (
    await fetch(`http://127.0.0.1:${port}/transcript`)
  ).json()
  assert.deepEqual(transcript, [])
})

test('a server that is not running is reported as a failure via exitCode, not a thrown error', async (t) => {
  const originalExitCode = process.exitCode

  await assert.doesNotReject(() => main(['--port', '1', '--text', 'hello']))
  const exitCode = process.exitCode
  process.exitCode = originalExitCode

  // Port 1 is a privileged/unbound port in this test environment, so the
  // fetch itself rejects — main() must not let that propagate uncaught.
  assert.notEqual(exitCode, 0)
})
