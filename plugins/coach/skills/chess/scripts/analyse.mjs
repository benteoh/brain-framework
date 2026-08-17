#!/usr/bin/env node
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { defaultVendorDir, openEngine } from './lib/engine.mjs'

// Two-pass by design. Analysing every ply at full depth costs ~10x and teaches
// nothing extra: the bulk pass locates where the game actually turned, and only
// those positions earn a deep MultiPV look (which is what the coach needs in
// order to say "here were your three real options").
const BULK = { depth: 16, multipv: 1, movetime: 8000 }
const DEEP = { depth: 20, multipv: 3, movetime: 15000 }

// Centipawns lost by the move played, relative to the best available move.
const THRESHOLDS = { blunder: 200, mistake: 100, inaccuracy: 50 }

const MATE_CP = 10000

// A forced mate converts to a five-figure centipawn number, which would let one
// move dominate any average it appears in. Aggregates use a capped loss; the
// per-ply `cpLoss` stays raw, since that is the deterministic figure.
const CPL_CAP = 1000
const cappedLoss = (cpLoss) => Math.min(cpLoss, CPL_CAP)

function toCp(evaluation) {
  if (evaluation.mate !== null && evaluation.mate !== undefined) {
    return evaluation.mate > 0 ? MATE_CP - evaluation.mate : -MATE_CP - evaluation.mate
  }
  return evaluation.evalCp ?? 0
}

// Lichess's winning-chances curve, used so that a centipawn near equality
// counts for more than a centipawn in a won position.
function winPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1)
}

function moveAccuracy(before, after) {
  const drop = Math.max(0, before - after)
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669))
}

function classify(cpLoss, wasBest) {
  if (wasBest) return 'best'
  if (cpLoss >= THRESHOLDS.blunder) return 'blunder'
  if (cpLoss >= THRESHOLDS.mistake) return 'mistake'
  if (cpLoss >= THRESHOLDS.inaccuracy) return 'inaccuracy'
  return 'ok'
}

const PIECE_VALUE = { q: 9, r: 5, b: 3, n: 3 }

// Phased on non-pawn material rather than a piece count: both sides start on 62
// and a queen trade alone should not read as an endgame. Counting pieces
// instead puts the endgame boundary absurdly early, which makes per-phase
// accuracy meaningless.
export function phaseOf(fen, ply) {
  const board = fen.split(' ')[0]
  let material = 0
  for (const char of board) {
    const value = PIECE_VALUE[char.toLowerCase()]
    if (value) material += value
  }
  if (ply <= 24 && material >= 52) return 'opening'
  if (material <= 20) return 'endgame'
  return 'middlegame'
}

// Deterministic tags only. Naming the *motif* ("missed a back-rank fork") is a
// pedagogical judgement and belongs to the agent, not to this file.
function tagsFor({ move, evalBefore, evalAfter, bestMoveSan, inCheckBefore, inCheckAfter }) {
  const tags = []
  if (move.flags.includes('c') || move.flags.includes('e')) tags.push('played-capture')
  if (move.san.includes('+')) tags.push('played-check')
  if (move.san.includes('#')) tags.push('played-mate')
  if (move.flags.includes('p')) tags.push('played-promotion')
  if (inCheckBefore) tags.push('was-in-check')
  if (inCheckAfter) tags.push('gave-check')
  if (bestMoveSan && /x/.test(bestMoveSan)) tags.push('best-was-capture')
  if (bestMoveSan && /\+|#/.test(bestMoveSan)) tags.push('best-was-forcing')
  if (bestMoveSan && !/x|\+|#/.test(bestMoveSan)) tags.push('best-was-quiet')
  if (evalBefore.mate !== null && evalAfter.mate === null) tags.push('missed-mate')
  if (evalBefore.mate === null && evalAfter.mate !== null) tags.push('allowed-mate')
  return tags
}

export function summariseGame(plies, colour) {
  const mine = plies.filter((p) => p.byLearner)
  const counts = { best: 0, ok: 0, inaccuracy: 0, mistake: 0, blunder: 0 }
  for (const ply of mine) counts[ply.classification] += 1
  const byPhase = {}
  for (const phase of ['opening', 'middlegame', 'endgame']) {
    const inPhase = mine.filter((p) => p.phase === phase)
    byPhase[phase] = inPhase.length
      ? {
          moves: inPhase.length,
          acpl: Math.round(inPhase.reduce((sum, p) => sum + cappedLoss(p.cpLoss), 0) / inPhase.length),
          accuracy: Number((inPhase.reduce((sum, p) => sum + p.accuracy, 0) / inPhase.length).toFixed(1)),
          blunders: inPhase.filter((p) => p.classification === 'blunder').length,
        }
      : null
  }
  const tagCounts = {}
  for (const ply of mine) {
    if (ply.classification === 'ok' || ply.classification === 'best') continue
    for (const tag of ply.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
  }
  return {
    colour,
    moves: mine.length,
    counts,
    acpl: mine.length ? Math.round(mine.reduce((sum, p) => sum + cappedLoss(p.cpLoss), 0) / mine.length) : null,
    accuracy: mine.length ? Number((mine.reduce((sum, p) => sum + p.accuracy, 0) / mine.length).toFixed(1)) : null,
    byPhase,
    errorTags: Object.fromEntries(Object.entries(tagCounts).sort((a, b) => b[1] - a[1])),
  }
}

async function analyseGame({ engine, Chess, pgn, colour }) {
  const board = new Chess()
  board.loadPgn(pgn)
  const history = board.history({ verbose: true })
  if (!history.length) throw new Error('PGN contained no moves')

  await engine.newGame()

  // One evaluation per position; a move's "after" evaluation is the next
  // position's "before", so N+1 searches cover N moves.
  const positions = [history[0].before, ...history.map((m) => m.after)]
  const evaluations = []
  for (const fen of positions) evaluations.push(await engine.analyse(fen, BULK))

  const probe = new Chess()
  const plies = []
  for (let i = 0; i < history.length; i += 1) {
    const move = history[i]
    const evalBefore = evaluations[i]
    const evalAfter = evaluations[i + 1]
    const sign = move.color === 'w' ? 1 : -1
    const cpLoss = Math.max(0, (toCp(evalBefore) - toCp(evalAfter)) * sign)
    const wpBefore = winPercent(toCp(evalBefore) * sign)
    const wpAfter = winPercent(toCp(evalAfter) * sign)

    probe.load(move.before)
    const inCheckBefore = probe.isCheck()
    let bestMoveSan = null
    if (evalBefore.bestMove) {
      const attempt = new Chess(move.before)
      try {
        const played = attempt.move({
          from: evalBefore.bestMove.slice(0, 2),
          to: evalBefore.bestMove.slice(2, 4),
          promotion: evalBefore.bestMove[4],
        })
        bestMoveSan = played?.san ?? null
      } catch {
        bestMoveSan = null
      }
    }
    probe.load(move.after)
    const inCheckAfter = probe.isCheck()

    plies.push({
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      color: move.color,
      byLearner: (move.color === 'w') === (colour === 'white'),
      san: move.san,
      uci: move.lan,
      fenBefore: move.before,
      fenAfter: move.after,
      evalBefore: { cp: evalBefore.evalCp, mate: evalBefore.mate, depth: evalBefore.depth },
      evalAfter: { cp: evalAfter.evalCp, mate: evalAfter.mate, depth: evalAfter.depth },
      bestMove: evalBefore.bestMove,
      bestMoveSan,
      wasBest: evalBefore.bestMove === move.lan,
      cpLoss: Math.round(cpLoss),
      accuracy: Number(moveAccuracy(wpBefore, wpAfter).toFixed(1)),
      classification: classify(cpLoss, evalBefore.bestMove === move.lan),
      phase: phaseOf(move.before, i + 1),
      tags: tagsFor({ move, evalBefore, evalAfter, bestMoveSan, inCheckBefore, inCheckAfter }),
      alternatives: null,
    })
  }

  // Deep pass: only where the learner actually went wrong.
  const flagged = plies.filter((p) => p.byLearner && ['mistake', 'blunder'].includes(p.classification))
  for (const ply of flagged) {
    const deep = await engine.analyse(ply.fenBefore, DEEP)
    const seat = new Chess()
    ply.alternatives = deep.lines.map((line) => {
      seat.load(ply.fenBefore)
      const sanLine = []
      for (const uci of line.pv.slice(0, 6)) {
        try {
          const played = seat.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
          if (!played) break
          sanLine.push(played.san)
        } catch {
          break
        }
      }
      return { rank: line.rank, cp: line.evalCp, mate: line.mate, depth: line.depth, line: sanLine }
    })
    ply.deepDepth = deep.depth
  }

  return { plies, headers: board.getHeaders() }
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      games: { type: 'string', default: 'Learning/Chess/Games' },
      out: { type: 'string', default: 'Learning/Chess/Evidence' },
      vendor: { type: 'string' },
      limit: { type: 'string' },
      force: { type: 'boolean', default: false },
      flavour: { type: 'string', default: 'lite' },
    },
  })

  const gamesDir = path.resolve(values.games)
  const outDir = path.resolve(values.out)
  await mkdir(outDir, { recursive: true })

  const index = JSON.parse(await readFile(path.join(gamesDir, 'index.json'), 'utf8'))
  const targets = values.limit ? index.games.slice(0, Number(values.limit)) : index.games

  const require = createRequire(import.meta.url)
  const vendorDir = path.resolve(values.vendor ?? defaultVendorDir())
  const { Chess } = require(path.join(vendorDir, 'node_modules', 'chess.js'))
  const engine = await openEngine({ vendorDir, flavour: values.flavour })

  const provenance = {
    engine: engine.name,
    flavour: engine.flavour,
    threads: engine.threads,
    bulk: BULK,
    deep: DEEP,
    thresholdsCp: THRESHOLDS,
    aggregateLossCapCp: CPL_CAP,
    evalConvention: 'white-relative centipawns; cpLoss is relative to the mover',
    generatedAt: new Date().toISOString(),
  }

  const summaries = []
  const failures = []
  try {
    for (const [n, game] of targets.entries()) {
      const evidencePath = path.join(outDir, `${game.id}.json`)
      // Resumable: a batch that dies partway through should not throw away the
      // games it already paid for.
      if (!values.force) {
        const existing = await readFile(evidencePath, 'utf8').catch(() => null)
        if (existing) {
          const parsed = JSON.parse(existing)
          summaries.push({ id: game.id, ...parsed.summary, result: game.result, opening: game.opening })
          console.error(`[${n + 1}/${targets.length}] ${game.id} — already analysed, skipping`)
          continue
        }
      }

      const pgn = await readFile(path.join(gamesDir, game.pgnFile), 'utf8')
      const started = Date.now()
      try {
        const { plies, headers } = await analyseGame({ engine, Chess, pgn, colour: game.colour })
        const summary = summariseGame(plies, game.colour)
        await writeFile(evidencePath, `${JSON.stringify({ game, headers, provenance, summary, plies }, null, 2)}\n`)
        summaries.push({ id: game.id, ...summary, result: game.result, opening: game.opening })
        console.error(
          `[${n + 1}/${targets.length}] ${game.id} ${game.colour} ${game.result} — accuracy ${summary.accuracy}, ` +
            `${summary.counts.blunder} blunders, ${summary.counts.mistake} mistakes (${((Date.now() - started) / 1000).toFixed(0)}s)`,
        )
      } catch (error) {
        // One pathological position must not cost the whole batch. Record the
        // gap explicitly rather than letting the summary silently under-report.
        failures.push({ id: game.id, error: error.message })
        console.error(`[${n + 1}/${targets.length}] ${game.id} — FAILED: ${error.message}`)
      }
    }
  } finally {
    await engine.quit()
  }

  const aggregateTags = {}
  for (const summary of summaries) {
    for (const [tag, count] of Object.entries(summary.errorTags)) aggregateTags[tag] = (aggregateTags[tag] ?? 0) + count
  }
  const overall = {
    handle: index.handle,
    games: summaries.length,
    failures,
    provenance,
    accuracy: summaries.length
      ? Number((summaries.reduce((sum, s) => sum + (s.accuracy ?? 0), 0) / summaries.length).toFixed(1))
      : null,
    acpl: summaries.length ? Math.round(summaries.reduce((sum, s) => sum + (s.acpl ?? 0), 0) / summaries.length) : null,
    blundersPerGame: summaries.length
      ? Number((summaries.reduce((sum, s) => sum + s.counts.blunder, 0) / summaries.length).toFixed(2))
      : null,
    errorTags: Object.fromEntries(Object.entries(aggregateTags).sort((a, b) => b[1] - a[1])),
    perGame: summaries,
  }
  const summaryPath = path.join(outDir, 'summary.json')
  await writeFile(summaryPath, `${JSON.stringify(overall, null, 2)}\n`)
  console.error(`Wrote ${summaryPath}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.stack ?? error.message)
    process.exitCode = 1
  })
}
