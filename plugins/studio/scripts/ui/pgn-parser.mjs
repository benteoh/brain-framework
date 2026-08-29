import { Chess } from './chess.mjs'

export function parsePgn(pgn) {
  const raw = String(pgn || '')
  const headers = {}
  raw.replace(/^\[(\w+)\s+"([^"]*)"\]\s*$/gm, (_, key, val) => { headers[key] = val; return '' })
  let movetext = raw.replace(/^\[.*\]\s*$/gm, ' ')
  movetext = movetext.replace(/\{[^}]*\}/g, ' ')
  movetext = movetext.replace(/;[^\n]*/g, ' ')
  movetext = movetext.replace(/\([^()]*\)/g, ' ')
  movetext = movetext.replace(/\$\d+/g, ' ')
  movetext = movetext.replace(/\b\d+\.(\.\.)?/g, ' ')
  movetext = movetext.replace(/1-0|0-1|1\/2-1\/2|\*/g, ' ')
  const tokens = movetext.split(/\s+/).map(t => t.trim()).filter(Boolean)

  const startFen = (headers.SetUp === '1' && headers.FEN) ? headers.FEN : undefined
  const replay = new Chess(startFen)
  const positions = [replay.fen()]
  const moves = []
  for (const token of tokens) {
    const result = replay.move(token, { sloppy: true })
    if (!result) continue
    moves.push(result)
    positions.push(replay.fen())
  }
  return { headers, moves, positions, startFen: startFen || positions[0] }
}