#!/usr/bin/env node
// Static dev server for the Studio component library.
//
// Serves from the plugin root (plugins/studio) rather than from templates/, so
// that a page's `../scripts/ui/*.mjs` imports resolve: a server rooted at the
// HTML's own directory cannot reach its parent, and every module 404s.
//
// Sends no-store and the correct `text/javascript` type for .mjs, so editing a
// module and reloading always picks up the change. Python's http.server does
// neither, which is how an "unchanged" component survives a dozen reloads.
//
//   node plugins/studio/scripts/dev-server.mjs [--port 8081] [--host 0.0.0.0]
//   then open  http://<host>:<port>/templates/sandbox.html
//
// Development only. It binds 0.0.0.0 by default because under WSL a Windows
// browser cannot reach the distro's loopback, so a WSL-visible address is the
// only way to see the page at all — which also means it is reachable from the
// local network. Nothing here serves learner data; shipped sessions use
// serve.mjs, which binds loopback.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
}

export function contentTypeFor(filePath) {
  return TYPES[path.extname(filePath)] ?? 'application/octet-stream'
}

// Resolve a request path to a file inside `root`, or null if it escapes.
// `startsWith(root)` alone is not enough: a sibling directory whose name merely
// begins with the root's would pass it.
export function resolveWithinRoot(urlPath, root = ROOT) {
  let decoded
  try {
    decoded = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname)
  } catch {
    return null
  }
  const resolved = path.resolve(root, '.' + decoded)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}

export function createDevServer({ root = ROOT } = {}) {
  return createServer((req, res) => {
    const resolved = resolveWithinRoot(req.url, root)
    if (!resolved) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      return res.end('Forbidden')
    }

    stat(resolved)
      .then(async (st) => {
        const target = st.isDirectory() ? path.join(resolved, 'index.html') : resolved
        const body = await readFile(target)
        res.writeHead(200, {
          'Content-Type': contentTypeFor(target),
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        })
        res.end(body)
      })
      .catch(() => {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end(`Not found: ${req.url}`)
      })
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: 'string', default: '8081' },
      host: { type: 'string', default: '0.0.0.0' },
    },
  })
  createDevServer().listen(Number(values.port), values.host, () => {
    console.log(`Studio dev server on ${values.host}:${values.port} (root: ${ROOT})`)
    console.log(`  component gallery: /templates/gallery-shell.html`)
    console.log(`  sandbox:           /templates/sandbox.html`)
    console.log(`Under WSL, reach it from Windows at the address printed by: hostname -I`)
  })
}
