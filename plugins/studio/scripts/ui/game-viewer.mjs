import { createBoardWidget } from './board-widget-factory.mjs'
import { parsePgn } from './pgn-parser.mjs'
import { analyzeOnce } from './engine-fallback.mjs'
import { fmtScore, uciPvToSan, clamp } from './eval-bar.mjs'
import { renderMarkdownInto, escapeText } from './markdown.mjs'

export function createGameViewer(block, ctx, emitEvent) {
  const wrap = document.createElement('div')
  wrap.className = 'block block-game'
  wrap.appendChild(createAskAboutButton(ctx.sectionHeading, 'game', ctx.sectionId, ctx.blockIndex))

  const game = parsePgn(block.pgn)
  let currentPly = 0

  const card = document.createElement('div')
  card.className = 'board-card wide'

  if (block.headers && (block.headers.White || block.headers.Black)) {
    const head = document.createElement('p')
    head.className = 'board-caption'
    const whiteText = (block.headers.White || 'White') + ' vs ' + (block.headers.Black || 'Black') + (block.headers.Result ? (' · ' + block.headers.Result) : '')
    escapeText(head, whiteText)
    card.appendChild(head)
  }

  const row = document.createElement('div')
  row.className = 'board-row'
  const widget = createBoardWidget({ fen: game.positions[0], orientation: block.orientation, interactive: false, ariaPrefix: 'Game board' })
  row.appendChild(widget.el)
  card.appendChild(row)
  card.appendChild(widget.statusEl)

  const graphWrap = document.createElement('div')
  graphWrap.className = 'eval-graph-wrap'
  const graphApi = renderEvalGraph(game, block, ply => jumpTo(ply))
  graphWrap.appendChild(graphApi.el)
  card.appendChild(graphWrap)

  const nav = document.createElement('div')
  nav.className = 'game-nav'
  const navButtons = [
    ['|\u25c0', 'Jump to start', () => jumpTo(0)],
    ['\u25c0', 'Previous move', () => jumpTo(currentPly - 1)],
    ['\u25b6', 'Next move', () => jumpTo(currentPly + 1)],
    ['\u25b6|', 'Jump to end', () => jumpTo(game.moves.length)],
  ].map(([label, title, fn]) => {
    const btn = document.createElement('button')
    btn.type = 'button'; btn.className = 'game-nav-btn'
    btn.textContent = label; btn.title = title; btn.setAttribute('aria-label', title)
    btn.addEventListener('click', () => { fn(); card.focus() })
    nav.appendChild(btn)
    return btn
  })
  const plyCounter = document.createElement('span')
  plyCounter.className = 'game-nav-counter'
  nav.appendChild(plyCounter)
  const navHint = document.createElement('span')
  navHint.className = 'game-nav-hint'
  navHint.textContent = 'or use \u2190 \u2192 when focused'
  nav.appendChild(navHint)
  card.appendChild(nav)

  const moveListEl = document.createElement('div')
  moveListEl.className = 'move-list'
  card.appendChild(moveListEl)

  const annotationEl = document.createElement('div')
  annotationEl.className = 'annotation-note'
  annotationEl.hidden = true
  card.appendChild(annotationEl)

  const evalByPly = {}
  ;(block.evalGraph || []).forEach(e => { evalByPly[e.ply] = e })

  const startParts = (game.startFen || '').split(' ')
  const startColorWhite = startParts[1] !== 'b'
  const startMoveNumber = Number(startParts[5]) || 1

  function renderMoveList() {
    moveListEl.innerHTML = ''
    let moveNumber = startMoveNumber
    let colorWhite = startColorWhite
    for (let i = 0; i < game.moves.length; i++) {
      const ply = i + 1
      const pairEl = document.createElement('span')
      pairEl.className = 'move-pair'
      if (colorWhite) {
        const num = document.createElement('span')
        num.className = 'move-num'; num.textContent = moveNumber + '.'
        pairEl.appendChild(num)
      }
      const entry = evalByPly[ply]
      const chip = document.createElement('button')
      chip.type = 'button'
      let chipClass = 'move-chip'
      if (ply === currentPly) chipClass += ' current'
      if (entry && ['blunder', 'mistake', 'inaccuracy'].includes(entry.classification)) chipClass += ' ' + entry.classification
      chip.className = chipClass
      chip.textContent = game.moves[i].san
      chip.addEventListener('click', (() => { const tp = ply; return () => jumpTo(tp) })())
      pairEl.appendChild(chip)
      moveListEl.appendChild(pairEl)
      if (!colorWhite) moveNumber++
      colorWhite = !colorWhite
    }
  }

  function jumpTo(ply) {
    currentPly = clamp(ply, 0, game.moves.length)
    widget.setFen(game.positions[currentPly])
    renderMoveList()
    graphApi.setCursor(currentPly)
    const ann = block.annotations && block.annotations[String(currentPly)]
    if (ann) { annotationEl.hidden = false; setInlineMarkdown(annotationEl, ann) }
    else annotationEl.hidden = true
    plyCounter.textContent = currentPly + ' / ' + game.moves.length
    navButtons[0].disabled = navButtons[1].disabled = currentPly === 0
    navButtons[2].disabled = navButtons[3].disabled = currentPly === game.moves.length
    emitEvent('line-explored', ctx.sectionId, ctx.blockIndex, { ply: currentPly, san: currentPly > 0 ? game.moves[currentPly - 1].san : null })
  }

  card.setAttribute('tabindex', '0')
  card.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); jumpTo(currentPly - 1) }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); jumpTo(currentPly + 1) }
    else if (ev.key === 'Home') { ev.preventDefault(); jumpTo(0) }
    else if (ev.key === 'End') { ev.preventDefault(); jumpTo(game.moves.length) }
  })

  renderMoveList()
  graphApi.setCursor(0)
  plyCounter.textContent = '0 / ' + game.moves.length
  navButtons[0].disabled = navButtons[1].disabled = true
  wrap.appendChild(card)
  return wrap
}

function renderEvalGraph(game, block, onJump) {
  const svgNs = 'http://www.w3.org/2000/svg'
  const W = 600, H = 110, MID = H / 2
  const svg = document.createElementNS(svgNs, 'svg')
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H)
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('class', 'eval-graph')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', 'Evaluation graph across the game — click to jump to a move')

  const evalByPly = {}
  ;(block.evalGraph || []).forEach(e => { evalByPly[e.ply] = e })
  const n = game.moves.length

  function xFor(ply) { return n <= 0 ? 0 : (ply / n) * W }
  function yFor(entry) {
    let cp
    if (entry && typeof entry.mate === 'number' && entry.mate !== null) cp = entry.mate > 0 ? 500 : -500
    else cp = clamp((entry && typeof entry.cp === 'number') ? entry.cp : 0, -500, 500)
    return MID - (cp / 500) * MID
  }

  const midline = document.createElementNS(svgNs, 'line')
  midline.setAttribute('x1', 0); midline.setAttribute('y1', MID)
  midline.setAttribute('x2', W); midline.setAttribute('y2', MID)
  midline.setAttribute('class', 'midline')
  svg.appendChild(midline)

  const points = [[0, MID]]
  for (let ply = 1; ply <= n; ply++) points.push([xFor(ply), yFor(evalByPly[ply])])

  if (points.length > 1) {
    const areaPath = 'M0,' + MID + ' ' + points.map(p => 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + ' L' + W + ',' + MID + ' Z'
    const area = document.createElementNS(svgNs, 'path')
    area.setAttribute('d', areaPath); area.setAttribute('class', 'area-white')
    svg.appendChild(area)
    const line = document.createElementNS(svgNs, 'polyline')
    line.setAttribute('points', points.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '))
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', 'var(--color-accent)'); line.setAttribute('stroke-width', '1.5')
    svg.appendChild(line)
  }

  for (let i = 1; i <= n; i++) {
    const entry = evalByPly[i]
    if (entry && ['blunder', 'mistake', 'inaccuracy'].includes(entry.classification)) {
      const dot = document.createElementNS(svgNs, 'circle')
      dot.setAttribute('cx', xFor(i)); dot.setAttribute('cy', yFor(entry))
      dot.setAttribute('r', '3.2'); dot.setAttribute('fill', 'var(--eval-' + entry.classification + ')')
      dot.style.cursor = 'pointer'; dot.setAttribute('role', 'button')
      dot.setAttribute('aria-label', entry.classification + ' at move ' + i)
      ;((targetPly) => dot.addEventListener('click', ev => { ev.stopPropagation(); onJump(targetPly) }))(i)
      svg.appendChild(dot)
    }
  }

  const cursor = document.createElementNS(svgNs, 'line')
  cursor.setAttribute('class', 'cursor-line')
  cursor.setAttribute('y1', 0); cursor.setAttribute('y2', H)
  cursor.setAttribute('x1', 0); cursor.setAttribute('x2', 0)
  svg.appendChild(cursor)

  svg.addEventListener('click', ev => {
    const rect = svg.getBoundingClientRect()
    const ratio = rect.width ? (ev.clientX - rect.left) / rect.width : 0
    onJump(clamp(Math.round(ratio * n), 0, n))
  })

  return { el: svg, setCursor: ply => { const x = xFor(ply); cursor.setAttribute('x1', x); cursor.setAttribute('x2', x) } }
}

function createAskAboutButton(sectionHeading, blockType, sectionId, blockIndex) {
  const btn = document.createElement('button')
  btn.type = 'button'; btn.className = 'ask-about'
  btn.textContent = 'Ask about this'
  btn.setAttribute('aria-label', 'Ask the coach about this ' + blockType + ' block')
  btn.addEventListener('click', () => btn.dispatchEvent(new CustomEvent('ask-about', { detail: { sectionHeading, blockType, sectionId, blockIndex } })))
  return btn
}