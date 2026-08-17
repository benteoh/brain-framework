import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { request as httpRequest } from 'node:http'

import { createStudioServer } from '../scripts/serve.mjs'

async function withServer(t, { withAssets }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'studio-assets-'))
  const htmlPath = path.join(dir, 'exercise.html')
  const assetsDir = path.join(dir, 'assets')
  await writeFile(htmlPath, '<p>ciao</p>')
  await mkdir(assetsDir, { recursive: true })
  await writeFile(path.join(assetsDir, 'engine.js'), 'export const ok = 1')
  await writeFile(path.join(assetsDir, 'engine.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]))
  await writeFile(path.join(dir, 'secret.txt'), 'not yours')

  const server = createStudioServer({
    htmlPath,
    transcriptPath: path.join(dir, 'transcript.jsonl'),
    assetsDir: withAssets ? assetsDir : undefined,
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    return new Promise((resolve) => server.close(resolve))
  })
  return `http://127.0.0.1:${server.address().port}`
}

test('serves a JS asset with a script content type', async (t) => {
  const base = await withServer(t, { withAssets: true })
  const response = await fetch(`${base}/assets/engine.js`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/javascript/)
  assert.equal(await response.text(), 'export const ok = 1')
})

test('serves a wasm asset with the wasm content type browsers require for streaming compilation', async (t) => {
  const base = await withServer(t, { withAssets: true })
  const response = await fetch(`${base}/assets/engine.wasm`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/wasm')
})

test('sends cross-origin isolation headers so the page can use SharedArrayBuffer', async (t) => {
  const base = await withServer(t, { withAssets: true })
  const page = await fetch(base)
  assert.equal(page.headers.get('cross-origin-opener-policy'), 'same-origin')
  assert.equal(page.headers.get('cross-origin-embedder-policy'), 'require-corp')
  const asset = await fetch(`${base}/assets/engine.wasm`)
  assert.equal(asset.headers.get('cross-origin-embedder-policy'), 'require-corp')
  assert.equal(asset.headers.get('cross-origin-resource-policy'), 'same-origin')
})

test('omits the isolation headers entirely when no --assets directory is configured', async (t) => {
  const base = await withServer(t, { withAssets: false })
  const page = await fetch(base)
  assert.equal(page.headers.get('cross-origin-opener-policy'), null)
  assert.equal(page.headers.get('cross-origin-embedder-policy'), null)
})

test('refuses to escape the assets directory via traversal', async (t) => {
  const base = await withServer(t, { withAssets: true })
  const url = new URL(base)
  // Sent over a raw request, not fetch: fetch normalises "../" out of the path
  // before it leaves the client, so it cannot exercise the server's own guard.
  const raw = (rawPath) =>
    new Promise((resolve, reject) => {
      const request = httpRequest(
        { host: url.hostname, port: url.port, path: rawPath, method: 'GET' },
        (response) => {
          let body = ''
          response.on('data', (chunk) => {
            body += chunk
          })
          response.on('end', () => resolve({ status: response.statusCode, body }))
        },
      )
      request.on('error', reject)
      request.end()
    })

  for (const attempt of ['/assets/../secret.txt', '/assets/..%2Fsecret.txt', '/assets/nested/../../secret.txt']) {
    const response = await raw(attempt)
    assert.notEqual(response.status, 200, `${attempt} must not succeed`)
    assert.doesNotMatch(response.body, /not yours/, `${attempt} must not leak the file`)
  }
})

test('404s a missing asset rather than crashing', async (t) => {
  const base = await withServer(t, { withAssets: true })
  assert.equal((await fetch(`${base}/assets/nope.wasm`)).status, 404)
})

test('does not expose /assets at all when no directory is configured', async (t) => {
  const base = await withServer(t, { withAssets: false })
  assert.equal((await fetch(`${base}/assets/engine.js`)).status, 404)
})
