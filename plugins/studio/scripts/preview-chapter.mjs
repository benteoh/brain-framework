#!/usr/bin/env node
// Start the chapter shell on the bundled example payload, check that every
// piece of it actually loads, and print what to click to check the
// pedagogical rules by hand. Exists because "it rendered" is not the same as
// "the exercise still hides the answer", and only the second one matters.
//
//   node plugins/studio/scripts/preview-chapter.mjs [--port 4390] [--host 0.0.0.0]
//   node plugins/studio/scripts/preview-chapter.mjs --assets .brain/vendor/node_modules/stockfish/bin

import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: 'string', default: '4390' },
    host: { type: 'string', default: '0.0.0.0' },
    assets: { type: 'string' },
  },
})

function wslAddress() {
  try {
    if (!process.env.WSL_DISTRO_NAME) return null
    return execFileSync('hostname', ['-I']).toString().trim().split(/\s+/)[0] || null
  } catch {
    return null
  }
}

const outDir = await mkdtemp(path.join(tmpdir(), 'studio-preview-'))
const args = [
  path.join(ROOT, 'scripts', 'serve.mjs'),
  '--html', path.join(ROOT, 'templates', 'chapter-shell.html'),
  '--data', path.join(ROOT, 'templates', 'chapter-shell.example.json'),
  '--out', path.join(outDir, 'transcript.jsonl'),
  '--port', values.port,
  '--host', values.host,
]
if (values.assets) args.push('--assets', path.resolve(values.assets))

const server = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] })
server.stdout.on('data', () => {})
process.on('SIGINT', () => { server.kill(); process.exit(0) })

const base = `http://127.0.0.1:${values.port}`

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${base}/`)
      if (res.ok) return true
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100))
  }
  return false
}

if (!await waitForServer()) {
  console.error(`Server did not come up on port ${values.port}. Is it already in use?`)
  server.kill()
  process.exit(1)
}

// Check the things that 404 silently and leave a page that still looks fine.
const checks = [['/', 'shell'], ['/data', 'chapter payload'], ['/transcript', 'transcript']]
if (values.assets) {
  // The two flavours the shell actually asks for. It picks the multithreaded
  // build when the page is cross-origin isolated and the single-threaded one
  // otherwise, so a missing single-threaded build is invisible until the day
  // isolation fails.
  checks.push(['/assets/stockfish-18-lite.js', 'engine (multithreaded)'])
  checks.push(['/assets/stockfish-18-lite-single.js', 'engine (single-threaded)'])
}

let ok = true
console.log('')
for (const [urlPath, label] of checks) {
  let status = 'ERR'
  try { status = String((await fetch(base + urlPath)).status) } catch { /* keep ERR */ }
  if (status !== '200') ok = false
  console.log(`  ${status === '200' ? '✓' : '✗'} ${status.padEnd(4)} ${urlPath}  (${label})`)
}
if (!values.assets) {
  console.log('    -  no --assets given: eval bars stay hidden and every other feature still works,')
  console.log('       but the engine-dependent checks below cannot be done. To include it:')
  console.log('         node plugins/coach/skills/chess/scripts/setup-engine.mjs')
  console.log('         node plugins/studio/scripts/preview-chapter.mjs --assets .brain/vendor/node_modules/stockfish/bin')
}
if (!ok) console.log('\n  Something above did not return 200 — the page will look plausible and be broken.')

const wsl = wslAddress()
console.log('\nOpen:')
console.log(`  ${base}/`)
if (wsl) {
  console.log(`  http://localhost:${values.port}/            (from Windows — usually works)`)
  console.log(`  http://${wsl}:${values.port}/    (from Windows — if localhost does not)`)
}

console.log(`
What to check, in the "Practice: castle before it's too late" section:

  Exercise 1 is a move puzzle. O-O is correct; Ng5 and d3 are wrong answers the
  author anticipated; anything else (h3, say) is unanticipated.

  1. Play Ng5 — an anticipated wrong answer.
     EXPECT: authored feedback, an X on g5, board resets after ~1s.
     EXPECT: eval bar still hidden. No explanation. No engine best move.
     EXPECT: a quiet "Show me the answer" appears below.
     THIS IS THE BUG THAT WAS FIXED: it used to reveal the eval and top 3 lines.

  2. Play h3 — an unanticipated move.
     EXPECT: "Not one of the lines I anticipated", then an engine comparison
     phrased as a gap ("worth X ... best move here is worth Y ... a gap of
     about N pawns"). It must NOT name the best move.
     (Needs --assets; without an engine you get the unavailable note instead.)

  3. Press "Show me the answer".
     EXPECT: eval bar and top lines appear, explanation appears, the engine's
     best move is finally named, the board goes non-interactive, and the
     section rail marks the section done.

  4. Reload and solve it properly with O-O.
     EXPECT: same reveal, plus a right-verdict marker on g1.

  Exercise 3 is text mode: type "king safety" (correct) or anything else
  (unanticipated) to see the same rules on a non-board block.

  Every eval readout should carry its depth (d18, "at depth 18"). Hover any
  block and press "Ask about this" — the coach drawer should open with that
  block pre-filled.

Transcript of what you did (the events a debrief would read):
  ${path.join(outDir, 'transcript.jsonl')}
  Watch it live with:  tail -f ${path.join(outDir, 'transcript.jsonl')}

Ctrl-C to stop.
`)
