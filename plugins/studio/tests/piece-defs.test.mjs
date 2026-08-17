import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { buildDefs } from '../scripts/build-piece-defs.mjs'

const run = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const TEMPLATES = ['board-shell.html', 'chapter-shell.html']

test('builds a symbol for all twelve pieces', async () => {
  const defs = await buildDefs({ dir: path.join(ROOT, 'assets', 'pieces', 'chessnut'), prefix: 'pc' })
  for (const piece of ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP']) {
    assert.match(defs, new RegExp(`<symbol id="pc-${piece}" viewBox=`), `missing symbol for ${piece}`)
  }
  assert.equal((defs.match(/<symbol /g) ?? []).length, 12)
})

test('scopes ids inside the art so twelve symbols can share one document', async () => {
  const defs = await buildDefs({ dir: path.join(ROOT, 'assets', 'pieces', 'chessnut'), prefix: 'pc' })
  const ids = [...defs.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
  assert.equal(new Set(ids).size, ids.length, 'duplicate id would silently repoint every later <use>')
  for (const id of ids) assert.match(id, /^pc-/)
})

test('fails loudly rather than emitting a partial set', async () => {
  await assert.rejects(
    () => buildDefs({ dir: path.join(ROOT, 'assets', 'pieces'), prefix: 'pc' }),
    /missing wK\.svg/,
  )
})

for (const template of TEMPLATES) {
  test(`${template} has the generated block committed and up to date`, async () => {
    // --check exits non-zero when the committed block has drifted from the art,
    // so editing a source SVG without regenerating is caught here rather than
    // showing up as a wrong-looking board.
    await run('node', [
      path.join(ROOT, 'scripts', 'build-piece-defs.mjs'),
      '--set', 'chessnut',
      '--prefix', 'pc',
      '--check',
      '--into', path.join(ROOT, 'templates', template),
    ])
  })

  test(`${template} renders pieces as <use>, never as text glyphs`, async () => {
    const html = await readFile(path.join(ROOT, 'templates', template), 'utf8')
    assert.match(html, /<symbol id="pc-wK"/)
    assert.doesNotMatch(
      html,
      /setAttribute\('class', 'piece'\)[\s\S]{0,200}textContent = glyph/,
      'text-glyph piece renderer is back',
    )
    assert.doesNotMatch(html, /text\.piece \{/, 'stale text-glyph piece CSS')
  })
}
