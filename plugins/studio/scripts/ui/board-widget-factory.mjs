import { Chess } from './chess.mjs'
import {
  FILES, SQUARE_PX, PIECE_INSET, SHOW_COORDS, WRONG_MOVE_RESET_MS,
  PIECE_GLYPHS, squareToXY
} from './board-constants.mjs'

const svgNs = 'http://www.w3.org/2000/svg'
let boardWidgetSeq = 0

function parseFenBoard(fen) {
  const placement = fen.split(' ')[0]
  const rows = placement.split('/')
  const board = {}
  rows.forEach((rowStr, i) => {
    const rankNumber = 8 - i
    let fileIndex = 0
    for (let c = 0; c < rowStr.length; c++) {
      const ch = rowStr[c]
      if (/[1-8]/.test(ch)) fileIndex += Number(ch)
      else { board[FILES[fileIndex] + rankNumber] = ch; fileIndex++ }
    }
  })
  return board
}

function uciToMoveParts(uci) {
  if (!uci || uci.length < 4) return null
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined }
}

function findKingSquare(chess, color) {
  const board = chess.board()
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = board[rank][file]
      if (sq && sq.type === 'k' && sq.color === color) {
        return sq.square
      }
    }
  }
  return null
}

export function createBoardWidget(options = {}) {
  const opts = options
  const id = 'bw' + (boardWidgetSeq++)
  const orientation = opts.orientation === 'black' ? 'black' : 'white'
  let interactive = !!opts.interactive
  const chess = new Chess(opts.fen)
  let selected = null
  let legalDestinations = new Map()
  let pendingPromotion = null
  const staticArrows = opts.arrows || []
  let verdict = null
  let engineArrow = null
  let highlightSquares = opts.highlights || []
  let lastMove = opts.lastMove || null // { from, to }
  const onMove = typeof opts.onMove === 'function' ? opts.onMove : null
  const onSelectionChange = typeof opts.onSelectionChange === 'function' ? opts.onSelectionChange : null

  const holder = document.createElement('div')
  holder.className = 'board-holder'

  const svg = document.createElementNS(svgNs, 'svg')
  svg.setAttribute('viewBox', '0 0 480 480')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', (opts.ariaPrefix || 'Chess board') + ', ' + (chess.turn() === 'w' ? 'white' : 'black') + ' to move')
  svg.classList.add('board-svg')
  if (!interactive) svg.classList.add('readonly')

  const defs = document.createElementNS(svgNs, 'defs')
  const markerId = id + '-arrow'
  const marker = document.createElementNS(svgNs, 'marker')
  marker.setAttribute('id', markerId)
  marker.setAttribute('markerUnits', 'userSpaceOnUse')
  marker.setAttribute('markerWidth', '18')
  marker.setAttribute('markerHeight', '18')
  marker.setAttribute('refX', '15')
  marker.setAttribute('refY', '9')
  marker.setAttribute('orient', 'auto-start-reverse')
  const markerPath = document.createElementNS(svgNs, 'path')
  markerPath.setAttribute('d', 'M0,1 L17,9 L0,17 Z')
  markerPath.setAttribute('fill', 'context-stroke')
  marker.appendChild(markerPath)
  defs.appendChild(marker)
  svg.appendChild(defs)
  holder.appendChild(svg)

  const statusEl = document.createElement('div')
  statusEl.className = 'board-status'
  statusEl.setAttribute('aria-live', 'polite')
  statusEl.setAttribute('aria-atomic', 'true')
  const promoPicker = document.createElement('div')
  promoPicker.className = 'promotion-picker'
  promoPicker.hidden = true

  function verdictNode(square, kind) {
    const xy = squareToXY(square, orientation)
    const r = SQUARE_PX * 0.21
    const cx = xy.x + SQUARE_PX - r - 2
    const cy = xy.y + r + 2
    const g = document.createElementNS(svgNs, 'g')
    g.setAttribute('class', 'verdict verdict-' + kind)
    g.style.pointerEvents = 'none'
    const disc = document.createElementNS(svgNs, 'circle')
    disc.setAttribute('cx', cx); disc.setAttribute('cy', cy); disc.setAttribute('r', r)
    disc.setAttribute('fill', kind === 'right' ? 'var(--color-verdict-right)' : 'var(--color-verdict-wrong)')
    disc.setAttribute('stroke', '#fff'); disc.setAttribute('stroke-width', '2')
    g.appendChild(disc)
    const mark = document.createElementNS(svgNs, 'path')
    const k = r * 0.5
    mark.setAttribute('d', kind === 'right'
      ? ('M ' + (cx - k) + ' ' + cy + ' l ' + (k * 0.75) + ' ' + (k * 0.8) + ' L ' + (cx + k * 1.05) + ' ' + (cy - k * 0.75))
      : ('M ' + (cx - k) + ' ' + (cy - k) + ' L ' + (cx + k) + ' ' + (cy + k) +
         ' M ' + (cx + k) + ' ' + (cy - k) + ' L ' + (cx - k) + ' ' + (cy + k)))
    mark.setAttribute('stroke', '#fff')
    mark.setAttribute('stroke-width', Math.max(2.5, SQUARE_PX * 0.075))
    mark.setAttribute('stroke-linecap', 'round')
    mark.setAttribute('stroke-linejoin', 'round')
    mark.setAttribute('fill', 'none')
    g.appendChild(mark)
    return g
  }

  function pieceNode(code, x, y) {
    const inset = SQUARE_PX * PIECE_INSET
    const use = document.createElementNS(svgNs, 'use')
    const ref = '#pc-' + code
    use.setAttribute('href', ref)
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', ref)
    use.setAttribute('x', x + inset)
    use.setAttribute('y', y + inset)
    use.setAttribute('width', SQUARE_PX - inset * 2)
    use.setAttribute('height', SQUARE_PX - inset * 2)
    use.setAttribute('class', 'piece')
    use.style.pointerEvents = 'none'
    return use
  }

  function drawArrow(from, to, colorVar) {
    const a = squareToXY(from, orientation), b = squareToXY(to, orientation)
    const x1 = a.x + SQUARE_PX / 2, y1 = a.y + SQUARE_PX / 2
    const x2 = b.x + SQUARE_PX / 2, y2 = b.y + SQUARE_PX / 2
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const shorten = SQUARE_PX * 0.32
    const x2s = x2 - (dx / len) * shorten, y2s = y2 - (dy / len) * shorten
    const line = document.createElementNS(svgNs, 'line')
    line.setAttribute('x1', x1); line.setAttribute('y1', y1)
    line.setAttribute('x2', x2s); line.setAttribute('y2', y2s)
    line.setAttribute('stroke', colorVar)
    line.setAttribute('stroke-width', '6')
    line.setAttribute('stroke-linecap', 'round')
    line.setAttribute('marker-end', 'url(#' + markerId + ')')
    line.style.pointerEvents = 'none'
    svg.appendChild(line)
  }

  function updateStatus() {
    if (chess.in_checkmate()) {
      statusEl.textContent = 'Checkmate — ' + (chess.turn() === 'w' ? 'Black' : 'White') + ' wins.'
      statusEl.className = 'board-status warn'
    } else if (chess.in_stalemate()) {
      statusEl.textContent = 'Stalemate.'
      statusEl.className = 'board-status warn'
    } else if (chess.in_check()) {
      statusEl.textContent = (chess.turn() === 'w' ? 'White' : 'Black') + ' to move — in check.'
      statusEl.className = 'board-status warn'
    } else {
      statusEl.textContent = (chess.turn() === 'w' ? 'White' : 'Black') + ' to move.'
      statusEl.className = 'board-status'
    }
  }

  function render() {
    while (svg.lastChild && svg.lastChild !== defs) svg.removeChild(svg.lastChild)
    const boardMap = parseFenBoard(chess.fen())
    const highlightSet = {}
    highlightSquares.forEach(sq => { highlightSet[sq] = true })

    FILES.forEach(file => {
      for (let rankNumber = 1; rankNumber <= 8; rankNumber++) {
        const square = file + rankNumber
        const xy = squareToXY(square, orientation)
        const x = xy.x, y = xy.y
        const isLight = (FILES.indexOf(file) + rankNumber) % 2 === 1

        const rect = document.createElementNS(svgNs, 'rect')
        rect.setAttribute('x', x); rect.setAttribute('y', y)
        rect.setAttribute('width', SQUARE_PX); rect.setAttribute('height', SQUARE_PX)
        rect.setAttribute('class', 'square')
        rect.setAttribute('data-square', square)
        rect.setAttribute('tabindex', interactive ? '0' : '-1')
        rect.setAttribute('aria-label', square + (boardMap[square] ? (' ' + boardMap[square]) : ' empty'))
        const fillColor = square === selected ? 'var(--color-sq-selected)' : (isLight ? 'var(--color-sq-light)' : 'var(--color-sq-dark)')
        rect.setAttribute('fill', fillColor)
        if (interactive) {
          rect.addEventListener('click', () => onSquareClick(square))
          rect.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSquareClick(square) }
          })
        }
        svg.appendChild(rect)

        if (SHOW_COORDS) {
          const onLight = isLight ? 'var(--color-sq-coord-on-light)' : 'var(--color-sq-coord-on-dark)'
          if (x === 0) {
            const rankTxt = document.createElementNS(svgNs, 'text')
            rankTxt.setAttribute('x', x + SQUARE_PX * 0.08)
            rankTxt.setAttribute('y', y + SQUARE_PX * 0.28)
            rankTxt.setAttribute('class', 'coord')
            rankTxt.setAttribute('fill', onLight)
            rankTxt.textContent = square[1]
            svg.appendChild(rankTxt)
          }
          if (y === SQUARE_PX * 7) {
            const fileTxt = document.createElementNS(svgNs, 'text')
            fileTxt.setAttribute('x', x + SQUARE_PX * 0.92)
            fileTxt.setAttribute('y', y + SQUARE_PX * 0.90)
            fileTxt.setAttribute('text-anchor', 'end')
            fileTxt.setAttribute('class', 'coord')
            fileTxt.setAttribute('fill', onLight)
            fileTxt.textContent = square[0]
            svg.appendChild(fileTxt)
          }
        }

        if (highlightSet[square]) {
          const hl = document.createElementNS(svgNs, 'rect')
          hl.setAttribute('x', x); hl.setAttribute('y', y)
          hl.setAttribute('width', SQUARE_PX); hl.setAttribute('height', SQUARE_PX)
          hl.setAttribute('fill', 'var(--color-highlight)')
          hl.style.pointerEvents = 'none'
          svg.appendChild(hl)
        }

        // Last move highlight
        if (lastMove && (square === lastMove.from || square === lastMove.to)) {
          const lm = document.createElementNS(svgNs, 'rect')
          lm.setAttribute('x', x); lm.setAttribute('y', y)
          lm.setAttribute('width', SQUARE_PX); lm.setAttribute('height', SQUARE_PX)
          lm.setAttribute('fill', 'var(--color-sq-lastmove)')
          lm.style.pointerEvents = 'none'
          svg.appendChild(lm)
        }

        const piece = boardMap[square]
        if (piece) {
          const color = piece === piece.toUpperCase() ? 'w' : 'b'
          svg.appendChild(pieceNode(color + piece.toUpperCase(), x, y))
        }

        // Check highlight on king square
        if (chess.in_check()) {
          const kingSquare = findKingSquare(chess, chess.turn())
          if (square === kingSquare) {
            const check = document.createElementNS(svgNs, 'rect')
            check.setAttribute('x', x); check.setAttribute('y', y)
            check.setAttribute('width', SQUARE_PX); check.setAttribute('height', SQUARE_PX)
            check.setAttribute('fill', 'var(--color-sq-check)')
            check.style.pointerEvents = 'none'
            svg.appendChild(check)
          }
        }

        if (legalDestinations.has(square)) {
          const marker2 = document.createElementNS(svgNs, 'circle')
          marker2.setAttribute('cx', x + SQUARE_PX / 2)
          marker2.setAttribute('cy', y + SQUARE_PX / 2)
          const isCapture = !!piece || legalDestinations.get(square).some(m => !!m.captured)
          marker2.setAttribute('r', isCapture ? SQUARE_PX * 0.42 : SQUARE_PX * 0.16)
          marker2.setAttribute('fill', isCapture ? 'none' : 'var(--color-sq-legal)')
          marker2.setAttribute('stroke', isCapture ? 'var(--color-sq-legal-capture)' : 'none')
          marker2.setAttribute('stroke-width', isCapture ? '5' : '0')
          marker2.style.pointerEvents = 'none'
          svg.appendChild(marker2)
        }
      }
    })

    if (verdict && verdict.square) svg.appendChild(verdictNode(verdict.square, verdict.kind))
    staticArrows.forEach(arrow => {
      if (arrow && arrow.from && arrow.to) drawArrow(arrow.from, arrow.to, arrow.color ? arrow.color : 'var(--color-arrow)')
    })
    if (engineArrow) drawArrow(engineArrow.from, engineArrow.to, 'var(--color-arrow-best)')

    svg.setAttribute('aria-label', (opts.ariaPrefix || 'Chess board') + ', ' + (chess.turn() === 'w' ? 'white' : 'black') + ' to move')
    updateStatus()
  }

  function finalizeMove(from, to, promotion) {
    const result = chess.move({ from, to, promotion })
    clearSelection()
    if (!result) { render(); return }
    lastMove = { from, to }
    render()
    if (onMove) onMove(result, chess)
  }

  function clearSelection() {
    selected = null
    legalDestinations = new Map()
    pendingPromotion = null
    promoPicker.hidden = true
    promoPicker.innerHTML = ''
  }

  function showPromotionPicker(from, to, choices) {
    try {
      if (!Array.isArray(choices) || choices.length === 0) return
      pendingPromotion = { from, to }
      promoPicker.innerHTML = ''
      promoPicker.hidden = false
      const color = chess.turn()
      const pieces = ['q', 'r', 'b', 'n']
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i]
        if (!choices.some(m => m.promotion === piece)) continue
        const btn = document.createElement('button')
        btn.type = 'button'
        const ref = '#pc-' + color + piece.toUpperCase()
        btn.innerHTML = '<svg viewBox="0 0 100 100" width="34" height="34" aria-hidden="true" focusable="false">'
          + '<use href="' + ref + '" xlink:href="' + ref + '" width="100" height="100"></use></svg>'
        btn.setAttribute('aria-label', 'Promote to ' + piece)
        btn.addEventListener('click', () => finalizeMove(from, to, piece))
        promoPicker.appendChild(btn)
      }
    } catch (err) {
      console.error('showPromotionPicker failed:', err, { from, to, choices })
    }
  }

  function onSquareClick(square) {
    if (!interactive || pendingPromotion) return

    if (selected && legalDestinations.has(square)) {
      const choices = legalDestinations.get(square)
      if (choices.length > 1) showPromotionPicker(selected, square, choices)
      else finalizeMove(selected, square, choices[0].promotion)
      return
    }

    if (selected === square) { clearSelection(); render(); return }

    const piece = chess.get(square)
    if (piece && piece.color === chess.turn()) {
      const verboseMoves = chess.moves({ square, verbose: true })
      if (!verboseMoves.length) { clearSelection(); render(); return }
      selected = square
      legalDestinations = new Map()
      verboseMoves.forEach(m => {
        if (!legalDestinations.has(m.to)) legalDestinations.set(m.to, [])
        legalDestinations.get(m.to).push(m)
      })
      render()
      if (onSelectionChange) onSelectionChange(square, verboseMoves)
      return
    }

    clearSelection()
    render()
  }

  render()

  return {
    el: holder,
    svg,
    statusEl,
    promoPicker,
    setFen: (fen) => { chess.load(fen); clearSelection(); render(); },
    getFen: () => chess.fen(),
    getChess: () => chess,
    setArrows: (arrows) => { staticArrows.length = 0; if (arrows) staticArrows.push(...arrows); render(); },
    setEngineArrow: (fromTo) => { engineArrow = fromTo; render(); },
    setHighlights: (squares) => { highlightSquares = squares || []; render(); },
    setLastMove: (from, to) => { lastMove = from && to ? { from, to } : null; render(); },
    setInteractive: (val) => { interactive = !!val; svg.classList.toggle('readonly', !interactive); },
    isInteractive: () => interactive,
    clearSelection,
    setVerdict: (square, kind) => { verdict = square ? { square, kind } : null; render(); },
    render,
  }
}