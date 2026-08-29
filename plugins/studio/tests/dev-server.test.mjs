import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'

import { contentTypeFor, createDevServer, resolveWithinRoot } from '../scripts/dev-server.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

test('resolves a path inside the plugin root', () => {
  assert.equal(resolveWithinRoot('/templates/sandbox.html'), path.join(ROOT, 'templates', 'sandbox.html'))
})

test('resolves the module paths a template imports as ../scripts/ui/*', () => {
  assert.equal(resolveWithinRoot('/scripts/ui/index.mjs'), path.join(ROOT, 'scripts', 'ui', 'index.mjs'))
})

test('normalises literal and %2e-encoded ../ segments rather than escaping', () => {
  // WHATWG URL collapses both forms before we ever see them, so they land
  // inside the root and 404 there. Asserted so a future rewrite that parses the
  // path by hand cannot quietly change this without a test noticing.
  assert.equal(resolveWithinRoot('/../../etc/passwd'), path.join(ROOT, 'etc', 'passwd'))
  assert.equal(resolveWithinRoot('/%2e%2e/%2e%2e/etc/passwd'), path.join(ROOT, 'etc', 'passwd'))
})

test('rejects traversal hidden behind an encoded slash', () => {
  // The vector that actually works: %2f is not a path separator to the URL
  // parser, so `..%2f..%2f` survives normalisation as a single opaque segment
  // and only becomes real `../../` at decodeURIComponent time. That is why the
  // root check has to run on the resolved filesystem path, not on the raw URL.
  assert.equal(resolveWithinRoot('/..%2f..%2fetc/passwd'), null)
  assert.equal(resolveWithinRoot('/%2e%2e%2f%2e%2e%2fetc/passwd'), null)
  assert.equal(resolveWithinRoot('/templates/..%2f..%2fsecret'), null)
})

test('rejects a sibling directory that merely shares the root prefix', () => {
  // The reason the guard compares against `root + sep` instead of a bare
  // startsWith(root): `.../studio-private` starts with `.../studio`.
  const sibling = ROOT + '-private'
  assert.equal(resolveWithinRoot('/x', sibling), path.join(sibling, 'x'))
  assert.equal(resolveWithinRoot(`/..%2f${path.basename(sibling)}%2fx`, ROOT), null)
})

test('serves .mjs as JavaScript, not as a download', () => {
  // A wrong MIME type here makes the browser refuse the module outright.
  assert.match(contentTypeFor('/a/b.mjs'), /^text\/javascript/)
  assert.match(contentTypeFor('/a/b.css'), /^text\/css/)
  assert.equal(contentTypeFor('/a/b.unknown'), 'application/octet-stream')
})

test('serves a real file with no-store, so an edited module is never cached', async (t) => {
  const server = createDevServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const { port } = server.address()

  const res = await fetch(`http://127.0.0.1:${port}/scripts/ui/index.mjs`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /^text\/javascript/)
  assert.match(res.headers.get('cache-control'), /no-store/)
  assert.match(await res.text(), /export/)
})

test('refuses a traversal request over the wire', async (t) => {
  const server = createDevServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const { port } = server.address()

  const res = await fetch(`http://127.0.0.1:${port}/..%2f..%2fetc/passwd`)
  assert.equal(res.status, 403)
})
