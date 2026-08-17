import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Source-level guards for board interaction defects that are invisible to a
// syntax check and only show up when a human clicks something. Each one here
// corresponds to a bug that actually shipped.

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (name) => readFile(path.join(ROOT, 'templates', name), 'utf8')

test('per-square click handlers close over a per-iteration binding', async () => {
  // `var square` is function-scoped, so all eight handlers built in one file's
  // loop shared a single variable holding its final value: every click on the
  // g-file called onSquareClick('g8'). The board looked fine and silently
  // refused to select anything.
  for (const template of ['board-shell.html', 'chapter-shell.html']) {
    const html = await read(template)
    assert.doesNotMatch(
      html,
      /for \(var rank[^)]*\)\s*\{\s*(\/\/[^\n]*\n\s*)*var square = /,
      `${template}: square must be let/const inside the rank loop, not var`,
    )
    assert.match(html, /(let|const) square = file \+ rank/, `${template}: expected a per-iteration square binding`)
  }
})

test('pieces do not intercept clicks meant for their square', async () => {
  // Pieces are painted above their square, so a piece with pointer events
  // swallows the click that should select or move it.
  const html = await read('chapter-shell.html')
  assert.match(html, /use\.style\.pointerEvents = 'none'/)
  assert.doesNotMatch(html, /use\.addEventListener\('click'/, 'pieces should not carry their own click handler')
})

test('chapter boards expose a verdict marker for pedagogical feedback', async () => {
  const html = await read('chapter-shell.html')
  assert.match(html, /setVerdict: function \(square, kind\)/)
  assert.match(html, /verdict-right/)
  assert.match(html, /verdict-wrong/)
})

test('a wrong move is marked and the position restored, whether or not it was anticipated', async () => {
  const html = await read('chapter-shell.html')
  assert.match(html, /function markWrongAndReset\(\)/)
  // Called from both the anticipated-wrong branch and the unmatched branch;
  // an unanticipated move used to leave the board silently changed.
  assert.ok(
    (html.match(/markWrongAndReset\(\);/g) ?? []).length >= 2,
    'markWrongAndReset must cover both the matched-but-wrong and unmatched paths',
  )
  assert.match(html, /WRONG_MOVE_RESET_MS/)
})

test('the game viewer offers buttons as well as keyboard navigation', async () => {
  const html = await read('chapter-shell.html')
  assert.match(html, /game-nav-btn/)
  assert.match(html, /ArrowLeft/)
  assert.match(html, /ArrowRight/)
  assert.match(html, /'Home'/)
  assert.match(html, /'End'/)
  assert.match(html, /game-nav-counter/)
})

test('arrowheads are sized in user space, not multiplied by stroke width', async () => {
  // markerUnits defaults to strokeWidth, which turned an 8-unit head into a
  // ~48px triangle inside a 60px square.
  const html = await read('chapter-shell.html')
  assert.match(html, /marker\.setAttribute\('markerUnits', 'userSpaceOnUse'\)/)
})
