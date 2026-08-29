import { request, isAvailable } from './engine-manager.mjs'
import { normalizeToWhite, uciPvToSan, fmtScore } from './eval-bar.mjs'

// Bounded, because the engine queue supersedes a pending request rather than
// queueing it: if another board asks for analysis first, this request's onBest
// never fires at all. An unbounded promise then leaves the learner looking at
// "checking with the engine…" for the rest of the session, which reads as a
// broken page rather than as a missing engine.
export const ANALYZE_ONCE_TIMEOUT_MS = 15000

export async function analyzeOnce(fen, depth = 14, { timeoutMs = ANALYZE_ONCE_TIMEOUT_MS } = {}) {
  if (isAvailable() === false) return null
  const turnIsWhite = fen.split(' ')[1] === 'w'
  return new Promise(resolve => {
    let settled = false
    const settle = value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => settle(null), timeoutMs)
    request(fen, {
      depth, multipv: 1,
      onBest: (best, lines) => {
        const top = lines[0]
        if (!top) { settle(null); return }
        const norm = normalizeToWhite(top.cp, top.mate, turnIsWhite)
        settle({ best, cpWhite: norm.cp, mateWhite: norm.mate, depth: top.depth, pv: top.pv })
      },
    })
  })
}

export async function engineUnavailableNote() {
  const note = document.createElement('p')
  note.className = 'eval-hidden-note'
  note.textContent = ''
  const { onAvailability } = await import('./engine-manager.mjs')
  onAvailability(available => {
    note.hidden = available !== false
    note.textContent = available === false ? 'Live engine unavailable in this session — everything else still works.' : ''
  })
  return note
}