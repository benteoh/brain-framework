import { createBoardWidget } from './board-widget-factory.mjs'
import { attachLiveAnalysis } from './live-analysis.mjs'
import { renderMarkdownInto, escapeText } from './markdown.mjs'
import { clamp } from './eval-bar.mjs'
import { engineUnavailableNote } from './engine-fallback.mjs'
import { createBlockWrapper } from './shared-utils.mjs'
import { Chess } from './chess.mjs'
import { uciPvToSan } from './eval-bar.mjs'

export function createBoardBlock(block, ctx, emitEvent) {
  const wrap = createBlockWrapper('block-board', ctx, 'board')
  const card = document.createElement('div')
  card.className = 'board-card'

  let exploredMoves = []
  let positions = null
  let moveObjs = null
  let currentStep = 0

  const widget = createBoardWidget({
    fen: block.fen,
    orientation: block.orientation,
    interactive: !!block.interactive,
    arrows: block.arrows,
    highlights: block.highlights,
    ariaPrefix: ctx.sectionHeading + ' board',
    onMove: result => {
      exploredMoves.push(result.san)
      emitEvent('line-explored', ctx.sectionId, ctx.blockIndex, {
        startFen: positions ? positions[currentStep] : block.fen,
        moves: exploredMoves.slice(),
      })
      if (analysisCtl) analysisCtl.refresh()
    },
  })

  const row = document.createElement('div')
  row.className = 'board-row'
  row.appendChild(widget.el)

  let analysisCtl = null
  if (block.analysis !== 'off') {
    analysisCtl = attachLiveAnalysis(widget, { depth: 18, multipv: 3 })
    row.appendChild(analysisCtl.evalBarEl)
  }
  card.appendChild(row)
  card.appendChild(widget.statusEl)
  card.appendChild(widget.promoPicker)
  if (analysisCtl) card.appendChild(analysisCtl.topLinesEl)
  card.appendChild(engineUnavailableNote())

  let moveListEl = null
  let prevBtn = null
  let nextBtn = null

  function gotoStep(step) {
    currentStep = clamp(step, 0, moveObjs.length)
    widget.setFen(positions[currentStep])
    exploredMoves = []
    if (analysisCtl) analysisCtl.refresh()
    renderMoveList()
    prevBtn.disabled = currentStep === 0
    nextBtn.disabled = currentStep === moveObjs.length
  }

  function renderMoveList() {
    moveListEl.innerHTML = ''
    const startPly = (block.line && block.line.startPly) || 0
    for (let i = 0; i < moveObjs.length; i++) {
      const pairEl = document.createElement('span')
      pairEl.className = 'move-pair'
      const isWhiteMove = (startPly + i) % 2 === 0
      if (isWhiteMove) {
        const num = document.createElement('span')
        num.className = 'move-num'
        num.textContent = (Math.floor((startPly + i) / 2) + 1) + '.'
        pairEl.appendChild(num)
      }
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'move-chip' + (i + 1 === currentStep ? ' current' : '')
      chip.textContent = moveObjs[i].san
      chip.addEventListener('click', (() => { const idx = i; return () => gotoStep(idx + 1) })())
      pairEl.appendChild(chip)
      moveListEl.appendChild(pairEl)
    }
  }

  if (block.line && Array.isArray(block.line.moves) && block.line.moves.length) {
    const replay = new Chess(block.fen)
    positions = [block.fen]
    moveObjs = []
    block.line.moves.forEach(san => {
      const result = replay.move(san, { sloppy: true })
      if (result) { moveObjs.push(result); positions.push(replay.fen()) }
    })

    const controls = document.createElement('div')
    controls.className = 'board-controls'
    prevBtn = document.createElement('button')
    prevBtn.type = 'button'; prevBtn.className = 'board-btn'; prevBtn.textContent = '\u2039 Prev'
    prevBtn.setAttribute('aria-label', 'Previous move in the line')
    nextBtn = document.createElement('button')
    nextBtn.type = 'button'; nextBtn.className = 'board-btn'; nextBtn.textContent = 'Next \u203A'
    nextBtn.setAttribute('aria-label', 'Next move in the line')
    controls.appendChild(prevBtn); controls.appendChild(nextBtn)
    card.appendChild(controls)

    moveListEl = document.createElement('div')
    moveListEl.className = 'move-list'
    card.appendChild(moveListEl)

    prevBtn.addEventListener('click', () => gotoStep(currentStep - 1))
    nextBtn.addEventListener('click', () => gotoStep(currentStep + 1))
    card.setAttribute('tabindex', '0')
    card.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); gotoStep(currentStep - 1) }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); gotoStep(currentStep + 1) }
    })
    gotoStep(0)
  }

  if (block.interactive) {
    const resetBtn = document.createElement('button')
    resetBtn.type = 'button'; resetBtn.className = 'board-btn'; resetBtn.textContent = 'Reset to position'
    resetBtn.addEventListener('click', () => {
      const basePos = positions ? positions[currentStep] : block.fen
      widget.setFen(basePos)
      exploredMoves = []
      if (analysisCtl) analysisCtl.refresh()
    })
    const resetRow = document.createElement('div')
    resetRow.className = 'board-controls'
    resetRow.appendChild(resetBtn)
    card.appendChild(resetRow)
  }

  if (block.caption) {
    const cap = document.createElement('p')
    cap.className = 'board-caption'
    escapeText(cap, block.caption)
    card.appendChild(cap)
  }

  wrap.appendChild(card)
  return wrap
}