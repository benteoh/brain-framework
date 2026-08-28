import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { evalLossCp } from '../scripts/ui/exercise-block.mjs'

// The shell template and the extracted module are two copies of the same
// exercise behaviour until the shell is rebuilt from the library. These guards
// run against both, so the copies cannot drift apart on the rules that decide
// whether an exercise is still an exercise.

const ROOT = path.join(import.meta.dirname, '..')
const SOURCES = [
  ['chapter-shell.html', path.join(ROOT, 'templates', 'chapter-shell.html')],
  ['exercise-block.mjs', path.join(ROOT, 'scripts', 'ui', 'exercise-block.mjs')],
]

async function eachSource(fn) {
  for (const [label, file] of SOURCES) fn(label, await readFile(file, 'utf8'))
}

test('a wrong attempt does not reveal the eval', async () => {
  // setHidden(false) used to fire on every commit(), so one deliberate wrong
  // move exposed the eval bar and the top three engine lines for the position
  // the learner was still being asked about. Unhiding belongs to the single
  // close path, alongside the explanation.
  await eachSource((label, src) => {
    const closeBody = src.slice(src.indexOf('function closeExercise'))
    assert.ok(closeBody.includes('setHidden(false)'), `${label}: closeExercise must unhide the eval`)
    const commitBody = src.slice(src.indexOf('function commit('), src.indexOf('function findMatchingAnswer'))
    assert.ok(
      !commitBody.includes('setHidden(false)'),
      `${label}: commit() must not unhide the eval — that hands over the answer mid-exercise`,
    )
  })
})

test('a wrong attempt does not reveal the authored explanation', async () => {
  await eachSource((label, src) => {
    const commitBody = src.slice(src.indexOf('function commit('), src.indexOf('function findMatchingAnswer'))
    assert.ok(
      !commitBody.includes('revealExplanation()'),
      `${label}: only closeExercise() may reveal the explanation`,
    )
  })
})

test('the engine fallback withholds the best move until the exercise closes', async () => {
  // The fallback has to answer an unanticipated move without becoming the
  // cheapest route to the solution, so it reports the gap and parks the move.
  await eachSource((label, src) => {
    const fallback = src.slice(src.indexOf('function showEngineFallback'), src.indexOf('function commit('))
    assert.ok(fallback.includes('pendingBestMove'), `${label}: fallback must park the best move`)
    assert.ok(
      !/Engine best from here/.test(fallback),
      `${label}: the fallback must not name the engine's best move`,
    )
  })
})

test('every exercise offers a way out that is not guessing', async () => {
  await eachSource((label, src) => {
    assert.ok(src.includes("'exercise-revealed'"), `${label}: reveal must be an observable event for the debrief`)
    assert.ok(src.includes('Show me the answer'), `${label}: reveal control must exist`)
    assert.ok(src.includes("markSectionProgress(ctx.sectionId, 'done')"), `${label}: revealing must still close the section`)
  })
})

test('the one-shot engine call is bounded', async () => {
  // Without a timeout, a superseded request never calls back and the learner
  // is left reading "checking with the engine…" forever.
  await eachSource(async (label, src) => {
    if (label !== 'chapter-shell.html') return
    assert.match(src, /ANALYZE_ONCE_TIMEOUT_MS/, `${label}: analyzeOnce must time out`)
  })
  const fallback = await readFile(path.join(ROOT, 'scripts', 'ui', 'engine-fallback.mjs'), 'utf8')
  assert.match(fallback, /ANALYZE_ONCE_TIMEOUT_MS/)
})

test('the ask-the-coach event bubbles, and is defined once', async () => {
  // A CustomEvent without `bubbles` dispatched on the button itself cannot
  // reach a shell listener on the chapter root: the control looks live and
  // does nothing.
  const shared = await readFile(path.join(ROOT, 'scripts', 'ui', 'shared-utils.mjs'), 'utf8')
  assert.match(shared, /bubbles: true/)

  const { globSync } = await import('node:fs')
  const files = globSync(path.join(ROOT, 'scripts', 'ui', '*.mjs'))
  const definers = []
  for (const f of files) {
    const src = await readFile(f, 'utf8')
    if (/^(export )?function createAskAboutButton\(/m.test(src)) definers.push(path.basename(f))
  }
  assert.deepEqual(definers, ['shared-utils.mjs'], 'exactly one definition of createAskAboutButton')
})

test('eval loss is measured in the mover\'s direction, and never across a mate', () => {
  const whiteToMove = '8/8/8/8/8/8/8/K6k w - - 0 1'
  const blackToMove = '8/8/8/8/8/8/8/K6k b - - 0 1'

  assert.equal(evalLossCp({ cpWhite: 120 }, { cpWhite: 20 }, whiteToMove), 100)
  // Black's move: the same white-relative drop is a gain for black, not a loss.
  assert.equal(evalLossCp({ cpWhite: 20 }, { cpWhite: 120 }, blackToMove), 100)
  assert.equal(evalLossCp({ cpWhite: 120 }, { cpWhite: 200 }, whiteToMove), 0)
  // Mate is not a centipawn quantity; subtracting it produces nonsense pawns.
  assert.equal(evalLossCp({ mateWhite: 3, cpWhite: null }, { cpWhite: 20 }, whiteToMove), null)
  assert.equal(evalLossCp(null, { cpWhite: 20 }, whiteToMove), null)
})
