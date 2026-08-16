#!/usr/bin/env node
import { createServer } from 'node:http'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

// Serves one local exercise HTML file plus a live, shared transcript: the page
// posts learner messages to /submit, the agent posts its own replies to
// /message (a separate local script, not exposed in the page's own UI), and
// both broadcast over Server-Sent Events so every connected tab sees the
// conversation happen live, in the page, with no polling and no cloud.
export function createStudioServer({ htmlPath, transcriptPath }) {
  const transcript = []
  const sseClients = new Set()

  function broadcast(entry) {
    const payload = `data: ${JSON.stringify(entry)}\n\n`
    for (const res of sseClients) res.write(payload)
  }

  async function record(role, text) {
    const entry = { role, text, at: new Date().toISOString() }
    transcript.push(entry)
    await mkdir(path.dirname(transcriptPath), { recursive: true })
    await appendFile(transcriptPath, `${JSON.stringify(entry)}\n`)
    broadcast(entry)
    return entry
  }

  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch {
          reject(new Error('Request body must be JSON'))
        }
      })
    })
  }

  return createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '')) {
      readFile(htmlPath, 'utf8').then(
        (html) => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(html)
        },
        (error) => {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end(`Could not read ${htmlPath}: ${error.message}`)
        },
      )
      return
    }

    if (req.method === 'GET' && req.url === '/transcript') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(transcript))
      return
    }

    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      // A complete, self-terminated SSE comment line (not a bare "\n"): a
      // partial frame here would merge into the next real event's buffer on
      // the client and corrupt its parsing.
      res.write(': connected\n\n')
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))
      return
    }

    if (req.method === 'POST' && (req.url === '/submit' || req.url === '/message')) {
      const role = req.url === '/submit' ? 'learner' : 'agent'
      readJsonBody(req).then(
        async (body) => {
          const text = typeof body.text === 'string' ? body.text : ''
          if (!text.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'text is required' }))
            return
          }
          await record(role, text)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        },
        (error) => {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: error.message }))
        },
      )
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  })
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      html: { type: 'string' },
      out: { type: 'string' },
      port: { type: 'string', default: '4390' },
    },
  })

  if (!values.html || !values.out) {
    console.error('Usage: serve.mjs --html <path> --out <path> [--port N]')
    process.exitCode = 1
    return
  }

  const server = createStudioServer({
    htmlPath: path.resolve(values.html),
    transcriptPath: path.resolve(values.out),
  })
  server.listen(Number(values.port), '127.0.0.1', () => {
    console.log(`Studio exercise server listening on http://127.0.0.1:${values.port}/`)
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
}
