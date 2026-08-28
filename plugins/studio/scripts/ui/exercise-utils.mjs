import { Chess } from './chess.mjs'

export function movesEquivalent(fen, sanA, sanB) {
  try {
    const a = new Chess(fen).move(sanA, { sloppy: true })
    const b = new Chess(fen).move(sanB, { sloppy: true })
    if (!a || !b) return false
    return a.from === b.from && a.to === b.to && (a.promotion || '') === (b.promotion || '')
  } catch { return false }
}

export function normalizeAnswerText(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ')
}