import { createRequire } from 'node:module'
import { availableParallelism } from 'node:os'
import path from 'node:path'

export const ENGINE_PACKAGE = 'stockfish'
export const ENGINE_VERSION = '18.0.8'

// Machine-local, gitignored, and deliberately outside the set of files
// `brain sync` checksums — installed engine binaries are reproducible, not
// source of truth.
export function defaultVendorDir(cwd = process.cwd()) {
  return path.join(cwd, '.brain', 'vendor')
}

export function engineFlavourPath(vendorDir, flavour) {
  const file = flavour === 'lite-single' ? 'stockfish-18-lite-single.js' : 'stockfish-18-lite.js'
  return path.join(vendorDir, 'node_modules', ENGINE_PACKAGE, 'bin', file)
}

function parseInfo(line) {
  const depth = /\bdepth (\d+)/.exec(line)
  const multipv = /\bmultipv (\d+)/.exec(line)
  const cp = /\bscore cp (-?\d+)/.exec(line)
  const mate = /\bscore mate (-?\d+)/.exec(line)
  const pv = /\bpv (.+)$/.exec(line)
  if (!depth || (!cp && !mate)) return null
  return {
    depth: Number(depth[1]),
    multipv: multipv ? Number(multipv[1]) : 1,
    evalCp: cp ? Number(cp[1]) : null,
    mate: mate ? Number(mate[1]) : null,
    pv: pv ? pv[1].trim().split(/\s+/) : [],
    bounded: /\b(upperbound|lowerbound)\b/.test(line),
  }
}

function sideToMove(fen) {
  return fen.split(/\s+/)[1] === 'b' ? 'b' : 'w'
}

/**
 * Opens one long-lived engine process. Callers analyse many positions through
 * it so the transposition table stays warm across a game.
 *
 * Every score this returns is white-relative and says so; UCI reports
 * side-to-move-relative scores, and silently mixing the two conventions is the
 * classic way to produce confidently backwards analysis.
 */
export async function openEngine({ vendorDir = defaultVendorDir(), flavour = 'lite', threads, hash = 256 } = {}) {
  const require = createRequire(import.meta.url)
  const enginePath = engineFlavourPath(vendorDir, flavour)
  let initEngine
  try {
    initEngine = require(path.join(vendorDir, 'node_modules', ENGINE_PACKAGE, 'index.js'))
  } catch {
    throw new Error(
      `Stockfish is not installed in ${vendorDir}. Run: node plugins/coach/skills/chess/scripts/setup-engine.mjs`,
    )
  }
  const engine = await initEngine(enginePath)

  const listeners = new Set()
  const onLine = (raw) => {
    const line = String(raw)
    for (const listener of [...listeners]) listener(line)
  }
  if (engine.addMessageListener) engine.addMessageListener(onLine)
  else engine.listener = onLine

  const send = (cmd) => engine.sendCommand(cmd)
  const until = (predicate, { timeoutMs = 60000, onTimeout } = {}) =>
    new Promise((resolve, reject) => {
      const collected = []
      let settled = false
      const finish = (fn, value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearTimeout(graceTimer)
        listeners.delete(listener)
        fn(value)
      }
      let graceTimer
      const timer = setTimeout(() => {
        if (!onTimeout) {
          finish(reject, new Error(`Engine timed out after ${timeoutMs}ms`))
          return
        }
        // Nudge the engine to end the current search and give it a short grace
        // period to answer. A search that overruns its own movetime is rare but
        // must not take the whole run down with it.
        onTimeout()
        graceTimer = setTimeout(
          () => finish(reject, new Error(`Engine did not respond to stop after ${timeoutMs}ms`)),
          5000,
        )
      }, timeoutMs)
      const listener = (line) => {
        collected.push(line)
        if (!predicate(line)) return
        finish(resolve, collected)
      }
      listeners.add(listener)
    })

  const uciLines = (send('uci'), await until((l) => l.startsWith('uciok')))
  const idLine = uciLines.find((l) => l.startsWith('id name '))
  const name = idLine ? idLine.slice('id name '.length).trim() : `Stockfish ${ENGINE_VERSION} (${flavour})`

  const resolvedThreads = threads ?? (flavour === 'lite-single' ? 1 : Math.max(1, Math.min(4, availableParallelism() - 2)))
  send(`setoption name Threads value ${resolvedThreads}`)
  send(`setoption name Hash value ${hash}`)
  send('isready')
  await until((l) => l.startsWith('readyok'))

  let queue = Promise.resolve()

  async function analyseNow(fen, { depth = 16, multipv = 1, movetime = 8000 } = {}) {
    send(`setoption name MultiPV value ${multipv}`)
    send(`position fen ${fen}`)
    const best = new Map()
    const collect = (line) => {
      if (!line.startsWith('info ')) return
      const info = parseInfo(line)
      if (!info || info.bounded) return
      const previous = best.get(info.multipv)
      if (!previous || info.depth >= previous.depth) best.set(info.multipv, info)
    }
    listeners.add(collect)
    try {
      // Both limits together: whichever is reached first ends the search. The
      // movetime cap is what keeps one pathological position from stalling an
      // entire batch, since depth alone has no wall-clock bound.
      send(`go depth ${depth}${movetime ? ` movetime ${movetime}` : ''}`)
      const tail = await until((l) => l.startsWith('bestmove'), {
        timeoutMs: Math.max(30000, (movetime || 0) * 3),
        onTimeout: () => send('stop'),
      })
      const bestmove = /^bestmove (\S+)/.exec(tail.find((l) => l.startsWith('bestmove')))
      const flip = sideToMove(fen) === 'b' ? -1 : 1
      const lines = [...best.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([rank, info]) => ({
          rank,
          depth: info.depth,
          evalCp: info.evalCp === null ? null : info.evalCp * flip,
          mate: info.mate === null ? null : info.mate * flip,
          pv: info.pv,
        }))
      const top = lines[0]
      return {
        fen,
        depth: top?.depth ?? depth,
        evalCp: top?.evalCp ?? null,
        mate: top?.mate ?? null,
        bestMove: bestmove ? bestmove[1] : null,
        pv: top?.pv ?? [],
        lines,
        relativeTo: 'white',
      }
    } finally {
      listeners.delete(collect)
    }
  }

  return {
    name,
    flavour,
    threads: resolvedThreads,
    id: async () => name,
    newGame() {
      send('ucinewgame')
      send('isready')
      return until((l) => l.startsWith('readyok'))
    },
    // Serialised: one search at a time per engine, so callers can fire and await
    // without tracking engine state themselves. The caller gets the rejection
    // via the returned promise; `queue` is deliberately settled to `undefined`
    // either way, so one failed search does not poison every later one.
    analyse(fen, options) {
      const result = queue.then(() => analyseNow(fen, options))
      queue = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
    async quit() {
      send('quit')
      if (engine.terminate) engine.terminate()
    },
  }
}
