import { createBoardWidget } from './board-widget-factory.mjs'
import { analyzeOnce } from './engine-fallback.mjs'
import { fmtScore } from './eval-bar.mjs'
import { renderMarkdownInto, escapeText } from './markdown.mjs'

export function createCompareBlock(block, ctx) {
  const wrap = document.createElement('div')
  wrap.className = 'block block-compare'
  wrap.appendChild(createAskAboutButton(ctx.sectionHeading, 'compare', ctx.sectionId, ctx.blockIndex))

  const grid = document.createElement('div')
  grid.className = 'compare-grid'
  grid.appendChild(renderCompareSide(block.left || {}, block.orientation || 'white'))
  grid.appendChild(renderCompareSide(block.right || {}, block.orientation || 'white'))
  wrap.appendChild(grid)

  if (block.note) {
    const note = document.createElement('div')
    note.className = 'compare-note'
    renderMarkdownInto(note, block.note)
    wrap.appendChild(note)
  }
  return wrap
}

function renderCompareSide(side, orientation) {
  const col = document.createElement('div')
  const label = document.createElement('div')
  label.className = 'compare-label'
  escapeText(label, side.label || '')
  col.appendChild(label)

  const card = document.createElement('div')
  card.className = 'board-card'
  const widget = createBoardWidget({ fen: side.fen, orientation, interactive: false, ariaPrefix: side.label || 'Position' })
  card.appendChild(widget.el)
  if (side.caption) {
    const cap = document.createElement('p')
    cap.className = 'board-caption'
    escapeText(cap, side.caption)
    card.appendChild(cap)
  }
  col.appendChild(card)

  const evalEl = document.createElement('div')
  evalEl.className = 'compare-eval'
  if (typeof side.evalCp === 'number') evalEl.textContent = fmtScore(side.evalCp, null)
  else {
    evalEl.textContent = '…'
    analyzeOnce(side.fen, 14).then(result => {
      evalEl.textContent = result ? (fmtScore(result.cpWhite, result.mateWhite) + '  (live, d' + result.depth + ')') : ''
    })
  }
  col.appendChild(evalEl)
  return col
}

function createAskAboutButton(sectionHeading, blockType, sectionId, blockIndex) {
  const btn = document.createElement('button')
  btn.type = 'button'; btn.className = 'ask-about'
  btn.textContent = 'Ask about this'
  btn.setAttribute('aria-label', 'Ask the coach about this ' + blockType + ' block')
  btn.addEventListener('click', () => btn.dispatchEvent(new CustomEvent('ask-about', { detail: { sectionHeading, blockType, sectionId, blockIndex } })))
  return btn
}