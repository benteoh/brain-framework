import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createStudioServer } from '../scripts/serve.mjs'

async function withServer(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'studio-serve-'))
  const htmlPath = path.join(dir, 'exercise.html')
  const transcriptPath = path.join(dir, 'transcript.jsonl')
  await writeFile(htmlPath, '<p>ciao</p>')

  const server = createStudioServer({ htmlPath, transcriptPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    // An open SSE connection is a live keep-alive socket; server.close() only
    // stops accepting new ones and would otherwise hang forever waiting for
    // it to end on its own, so force-close every existing connection too.
    server.closeAllConnections()
    return new Promise((resolve) => server.close(resolve))
  })
  const { port } = server.address()
  return { base: `http://127.0.0.1:${port}`, transcriptPath }
}

async function readSseEntries(base, count) {
  const controller = new AbortController()
  const response = await fetch(`${base}/events`, { signal: controller.signal })
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const entries = []
  while (entries.length < count) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let boundary
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      if (chunk.startsWith('data: ')) entries.push(JSON.parse(chunk.slice('data: '.length)))
    }
  }
  controller.abort()
  return entries
}

test('GET / serves the current HTML file content', async (t) => {
  const { base } = await withServer(t)
  const response = await fetch(`${base}/`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/html/)
  assert.equal(await response.text(), '<p>ciao</p>')
})

test('GET /transcript starts empty', async (t) => {
  const { base } = await withServer(t)
  const response = await fetch(`${base}/transcript`)
  assert.deepEqual(await response.json(), [])
})

test('POST /submit records a learner message, persists it, and returns ok', async (t) => {
  const { base, transcriptPath } = await withServer(t)
  const response = await fetch(`${base}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Buongiorno, un cappuccino e un cornetto, per favore.' }),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })

  const transcript = await (await fetch(`${base}/transcript`)).json()
  assert.equal(transcript.length, 1)
  assert.equal(transcript[0].role, 'learner')
  assert.equal(transcript[0].text, 'Buongiorno, un cappuccino e un cornetto, per favore.')
  assert.match(transcript[0].at, /^\d{4}-\d{2}-\d{2}T/)

  const persisted = (await readFile(transcriptPath, 'utf8')).trim().split('\n')
  assert.equal(persisted.length, 1)
  assert.equal(JSON.parse(persisted[0]).role, 'learner')
})

test('POST /message records an agent message the same way, tagged "agent"', async (t) => {
  const { base } = await withServer(t)
  await fetch(`${base}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Almost — o means or, not and.' }),
  })

  const transcript = await (await fetch(`${base}/transcript`)).json()
  assert.equal(transcript.length, 1)
  assert.equal(transcript[0].role, 'agent')
  assert.equal(transcript[0].text, 'Almost — o means or, not and.')
})

test('rejects a submission with empty or missing text without recording it', async (t) => {
  const { base } = await withServer(t)
  const response = await fetch(`${base}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '   ' }),
  })

  assert.equal(response.status, 400)
  assert.equal((await fetch(`${base}/transcript`)).ok, true)
  assert.deepEqual(await (await fetch(`${base}/transcript`)).json(), [])
})

test('a non-JSON body is rejected with 400 rather than crashing the server', async (t) => {
  const { base } = await withServer(t)
  const response = await fetch(`${base}/submit`, { method: 'POST', body: 'not json' })
  assert.equal(response.status, 400)
})

test('messages appear over /events as they are recorded, in order, to every connected client', async (t) => {
  const { base } = await withServer(t)

  const entriesPromise = readSseEntries(base, 2)

  // Give the server a tick to register the SSE connection before publishing.
  await new Promise((resolve) => setTimeout(resolve, 20))
  await fetch(`${base}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Buongiorno' }),
  })
  await fetch(`${base}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Ciao!' }),
  })

  const entries = await entriesPromise
  assert.equal(entries.length, 2)
  assert.equal(entries[0].role, 'learner')
  assert.equal(entries[0].text, 'Buongiorno')
  assert.equal(entries[1].role, 'agent')
  assert.equal(entries[1].text, 'Ciao!')
})

test('unknown routes 404', async (t) => {
  const { base } = await withServer(t)
  const response = await fetch(`${base}/nope`)
  assert.equal(response.status, 404)
})
