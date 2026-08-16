import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createStudioServer } from '../scripts/serve.mjs'

async function withServer(t, { data } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'studio-serve-'))
  const htmlPath = path.join(dir, 'exercise.html')
  const transcriptPath = path.join(dir, 'transcript.jsonl')
  const dataPath = path.join(dir, 'data.json')
  await writeFile(htmlPath, '<p>ciao</p>')
  if (data !== undefined) await writeFile(dataPath, JSON.stringify(data))

  const server = createStudioServer({
    htmlPath,
    transcriptPath,
    dataPath: data !== undefined ? dataPath : undefined,
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    // An open SSE connection is a live keep-alive socket; server.close() only
    // stops accepting new ones and would otherwise hang forever waiting for
    // it to end on its own, so force-close every existing connection too.
    server.closeAllConnections()
    return new Promise((resolve) => server.close(resolve))
  })
  const { port } = server.address()
  return { base: `http://127.0.0.1:${port}`, transcriptPath, dataPath }
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
  assert.equal(entries[0].kind, 'chat')
  assert.equal(entries[0].role, 'learner')
  assert.equal(entries[0].text, 'Buongiorno')
  assert.equal(entries[1].kind, 'chat')
  assert.equal(entries[1].role, 'agent')
  assert.equal(entries[1].text, 'Ciao!')
})

test('unknown routes 404', async (t) => {
  const { base } = await withServer(t)
  const response = await fetch(`${base}/nope`)
  assert.equal(response.status, 404)
})

test('GET /data returns 404 when no --data file was configured', async (t) => {
  const { base } = await withServer(t)
  const response = await fetch(`${base}/data`)
  assert.equal(response.status, 404)
})

test('GET /data returns the current parsed JSON content of the data file', async (t) => {
  const { base } = await withServer(t, { data: { title: 'Al Bar', hints: ['e = and'] } })
  const response = await fetch(`${base}/data`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await response.json(), { title: 'Al Bar', hints: ['e = and'] })
})

test('GET /data reflects an in-place edit to the data file, re-read fresh each request', async (t) => {
  const { base, dataPath } = await withServer(t, { data: { title: 'Original' } })
  assert.deepEqual(await (await fetch(`${base}/data`)).json(), { title: 'Original' })

  await writeFile(dataPath, JSON.stringify({ title: 'Updated' }))
  assert.deepEqual(await (await fetch(`${base}/data`)).json(), { title: 'Updated' })
})

test('GET /state starts empty', async (t) => {
  const { base } = await withServer(t)
  const response = await fetch(`${base}/state`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {})
})

test('POST /update replaces the in-memory state, reflected by GET /state', async (t) => {
  const { base } = await withServer(t)
  const response = await fetch(`${base}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' } }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })

  const state = await (await fetch(`${base}/state`)).json()
  assert.deepEqual(state, { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' })
})

test('POST /update broadcasts a {kind: "state", data, at} event over /events', async (t) => {
  const { base } = await withServer(t)

  const entriesPromise = readSseEntries(base, 1)
  await new Promise((resolve) => setTimeout(resolve, 20))
  await fetch(`${base}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { fen: '8/8/8/8/8/8/8/8 w - - 0 1' } }),
  })

  const [entry] = await entriesPromise
  assert.equal(entry.kind, 'state')
  assert.deepEqual(entry.data, { fen: '8/8/8/8/8/8/8/8 w - - 0 1' })
  assert.match(entry.at, /^\d{4}-\d{2}-\d{2}T/)
})

test('POST /update rejects a non-object data field without touching state', async (t) => {
  const { base } = await withServer(t)
  const response = await fetch(`${base}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'not-an-object' }),
  })
  assert.equal(response.status, 400)
  assert.deepEqual(await (await fetch(`${base}/state`)).json(), {})
})

test('GET /transcript keeps its original {role, text, at} shape, with no kind field', async (t) => {
  const { base } = await withServer(t)
  await fetch(`${base}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Buongiorno' }),
  })
  const transcript = await (await fetch(`${base}/transcript`)).json()
  assert.equal(transcript.length, 1)
  assert.deepEqual(Object.keys(transcript[0]).sort(), ['at', 'role', 'text'])
})
