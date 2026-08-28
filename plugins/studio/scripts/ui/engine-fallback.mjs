import { request, isAvailable } from './engine-manager.mjs'
import { normalizeToWhite, uciPvToSan, fmtScore } from './eval-bar.mjs'

export async function analyzeOnce(fen, depth = 14) {
  if (isAvailable() === false) return null
  const turnIsWhite = fen.split(' ')[1] === 'w'
  return new Promise(resolve => {
    request(fen, {
      depth, multipv: 1,
      onBest: (best, lines) => {
        const top = lines[0]
        if (!top) { resolve(null); return }
        const norm = normalizeToWhite(top.cp, top.mate, turnIsWhite)
        resolve({ best, cpWhite: norm.cp, mateWhite: norm.mate, depth: top.depth, pv: top.pv })
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