import { request, cancelPending, onAvailability, isAvailable } from './engine-manager.mjs'
import { normalizeToWhite, fmtScore, uciPvToSan } from './eval-bar.mjs'
import { uciToMoveParts } from './eval-bar.mjs'

export async function attachLiveAnalysis(widget, config = {}) {
  const depth = config.depth || 18
  const multipv = config.multipv || 3
  const showBestArrow = config.showBestArrow !== false
  const { createEvalBar, createTopLinesPanel } = await import('./eval-bar.mjs')
  const evalBar = createEvalBar()
  const topLines = createTopLinesPanel()
  let isActive = false
  let hidden = !!config.startHidden
  let Chess = null

  async function initChess() {
    if (!Chess) Chess = (await import('./chess.mjs')).default
  }

  function syncVisibility() {
    const engineGone = isAvailable() === false
    const show = !hidden && !engineGone
    evalBar.el.hidden = !show
    topLines.el.hidden = !show
  }

  async function requestAnalysis() {
    if (hidden || isAvailable() === false) return
    await initChess()
    const fen = widget.getFen()
    const turnIsWhite = fen.split(' ')[1] === 'w'
    evalBar.update({ thinking: true })
    request(fen, {
      depth, multipv,
      onInfo: lines => {
        const top = lines[0]
        if (!top) return
        const norm = normalizeToWhite(top.cp, top.mate, turnIsWhite)
        evalBar.update({ cpWhite: norm.cp, mateWhite: norm.mate, depth: top.depth, thinking: true })
        const normalizedLines = lines.map(l => {
          const n = normalizeToWhite(l.cp, l.mate, turnIsWhite)
          return { cpWhite: n.cp, mateWhite: n.mate, pv: l.pv, depth: l.depth }
        })
        topLines.update(fen, normalizedLines)
      },
      onBest: (best, lines) => {
        const top = lines[0]
        if (top) {
          const norm = normalizeToWhite(top.cp, top.mate, turnIsWhite)
          evalBar.update({ cpWhite: norm.cp, mateWhite: norm.mate, depth: top.depth, thinking: false })
        }
        if (best && showBestArrow && typeof widget.setEngineArrow === 'function') {
          const parts = uciToMoveParts(best)
          if (parts) widget.setEngineArrow({ from: parts.from, to: parts.to })
        }
      },
    })
  }

  const visEntry = {
    onActive: () => { isActive = true; requestAnalysis() },
    onInactive: () => { isActive = false; cancelPending() },
  }

  // Import VisibilityTracker from chapter shell - this is a simplified version
  // In practice, the shell should provide this
  let visibilityTracker = {
    register: () => {},
    unregister: () => {},
    refresh: (w) => { if (w === isActive) requestAnalysis() },
  }

  visibilityTracker.register(widget.el, visEntry)
  const unsubscribe = onAvailability(() => { syncVisibility() })
  syncVisibility()

  return {
    evalBarEl: evalBar.el,
    topLinesEl: topLines.el,
    setHidden: (val) => { hidden = !!val; syncVisibility(); if (!hidden && isActive) requestAnalysis() },
    refresh: () => { if (isActive) requestAnalysis() },
    runOnce: async (fen, oneOffOpts = {}) => {
      oneOffOpts = oneOffOpts || {}
      await initChess()
      const turnIsWhite = fen.split(' ')[1] === 'w'
      return new Promise(resolve => {
        request(fen, {
          depth: oneOffOpts.depth || depth, multipv: 1,
          onBest: (best, lines) => {
            const top = lines[0]
            const norm = top ? normalizeToWhite(top.cp, top.mate, turnIsWhite) : { cp: null, mate: null }
            resolve({ best, cpWhite: norm.cp, mateWhite: norm.mate, depth: top ? top.depth : null, pv: top ? top.pv : [] })
          },
        })
      })
    },
    destroy: () => { visibilityTracker.unregister(widget.el); if (unsubscribe) unsubscribe() },
  }
}