import { createBoardWidget } from './board-widget-factory.mjs'
import { attachLiveAnalysis } from './live-analysis.mjs'
import { analyzeOnce, engineUnavailableNote } from './engine-fallback.mjs'
import { uciPvToSan, fmtScore } from './eval-bar.mjs'
import { movesEquivalent, normalizeAnswerText } from './exercise-utils.mjs'
import { renderMarkdownInto, escapeHtml } from './markdown.mjs'

const WRONG_MOVE_RESET_MS = 1100

export function createExerciseBlock(block, ctx, emitEvent, markSectionProgress) {
  const wrap = document.createElement('div')
  wrap.className = 'block block-exercise'
  wrap.appendChild(createAskAboutButton(ctx.sectionHeading, 'exercise', ctx.sectionId, ctx.blockIndex))

  const question = document.createElement('p')
  question.className = 'exercise-question'
  renderMarkdownInto(question, block.question)
  wrap.appendChild(question)

  const card = document.createElement('div')
  card.className = 'board-card'
  const row = document.createElement('div')
  row.className = 'board-row'

  let attempt = 0
  let solved = false
  let hintIndex = 0

  const widget = createBoardWidget({
    fen: block.fen,
    orientation: block.orientation,
    interactive: block.mode === 'move',
    ariaPrefix: 'Exercise board',
    onMove: (result) => { if (!solved) commit(result.san, result.san) },
  })
  row.appendChild(widget.el)

  const analysisCtl = attachLiveAnalysis(widget, { depth: 18, multipv: 3, startHidden: true })
  row.appendChild(analysisCtl.evalBarEl)
  card.appendChild(row)
  card.appendChild(widget.statusEl)
  card.appendChild(widget.promoPicker)
  card.appendChild(analysisCtl.topLinesEl)
  card.appendChild(engineUnavailableNote())
  wrap.appendChild(card)

  if (block.mode === 'text') {
    const form = document.createElement('form')
    form.className = 'exercise-text-form'
    const input = document.createElement('input')
    input.type = 'text'; input.placeholder = 'Your answer…'; input.autocomplete = 'off'
    const submitBtn = document.createElement('button')
    submitBtn.type = 'submit'; submitBtn.textContent = 'Check'
    form.appendChild(input); form.appendChild(submitBtn)
    form.addEventListener('submit', ev => { ev.preventDefault(); if (solved || !input.value.trim()) return; commit(input.value.trim(), input.value.trim()) })
    wrap.appendChild(form)
  } else if (block.mode === 'choice') {
    const optionsWrap = document.createElement('div')
    optionsWrap.className = 'exercise-options'
    ;(block.options || []).forEach(optionText => {
      const btn = document.createElement('button')
      btn.type = 'button'; btn.className = 'exercise-option'
      renderMarkdownInto(btn, optionText)
      btn.addEventListener('click', () => { if (!solved) commit(optionText, optionText) })
      optionsWrap.appendChild(btn)
    })
    wrap.appendChild(optionsWrap)
  }

  const attemptNote = document.createElement('p')
  attemptNote.className = 'attempt-note'; attemptNote.hidden = true
  wrap.appendChild(attemptNote)

  const feedbackEl = document.createElement('div')
  feedbackEl.className = 'exercise-feedback'
  feedbackEl.hidden = true
  feedbackEl.setAttribute('aria-live', 'polite')
  feedbackEl.setAttribute('aria-atomic', 'true')
  wrap.appendChild(feedbackEl)

  const engineFallbackEl = document.createElement('div')
  engineFallbackEl.className = 'exercise-engine-fallback'; engineFallbackEl.hidden = true
  wrap.appendChild(engineFallbackEl)

  const explanationEl = document.createElement('div')
  explanationEl.className = 'exercise-explanation'; explanationEl.hidden = true
  wrap.appendChild(explanationEl)

  if (Array.isArray(block.hints) && block.hints.length) {
    const hintLadder = document.createElement('div')
    hintLadder.className = 'hint-ladder'
    const hintBtn = document.createElement('button')
    hintBtn.type = 'button'; hintBtn.className = 'hint-btn'
    hintBtn.textContent = 'Hint (' + block.hints.length + ')'
    hintLadder.appendChild(hintBtn)
    wrap.appendChild(hintLadder)
    hintBtn.addEventListener('click', () => {
      if (hintIndex >= block.hints.length) return
      const hintEl = document.createElement('div')
      hintEl.className = 'hint-item'
      renderMarkdownInto(hintEl, block.hints[hintIndex])
      hintLadder.insertBefore(hintEl, hintBtn)
      emitEvent('hint-revealed', ctx.sectionId, ctx.blockIndex, { index: hintIndex })
      hintIndex++
      hintBtn.textContent = hintIndex >= block.hints.length ? 'No more hints' : 'Hint (' + (block.hints.length - hintIndex) + ' left)'
      hintBtn.disabled = hintIndex >= block.hints.length
    })
  }

  function revealExplanation() {
    if (block.explanation) { explanationEl.hidden = false; renderMarkdownInto(explanationEl, block.explanation) }
    if (block.engineLine) {
      const line = document.createElement('p')
      line.className = 'exercise-engine-fallback'
      line.textContent = 'Authored engine line: ' + block.engineLine
      wrap.appendChild(line)
    }
  }

  function showEngineFallback(playedFen, playedLabel) {
    engineFallbackEl.hidden = false
    engineFallbackEl.textContent = 'Not one of the lines I anticipated — checking with the engine…'
    Promise.all([analyzeOnce(block.fen, 18), playedFen ? analyzeOnce(playedFen, 18) : Promise.resolve(null)])
      .then(([bestInfo, playedInfo]) => {
        const parts = []
        if (bestInfo) parts.push('Engine best from here: ' + (bestInfo.best ? uciPvToSan(block.fen, [bestInfo.best]) : '?') + '  ' + fmtScore(bestInfo.cpWhite, bestInfo.mateWhite) + '  d' + bestInfo.depth + '.')
        if (playedInfo && playedLabel) parts.push('Your move (' + playedLabel + '): ' + fmtScore(playedInfo.cpWhite, playedInfo.mateWhite) + '  d' + playedInfo.depth + '.')
        engineFallbackEl.textContent = parts.join(' ') || 'The live engine is unavailable, so no automatic comparison here — ask the coach if you want to talk it through.'
      })
  }

  function commit(learnerValue, displayLabel) {
    attempt++
    attemptNote.hidden = false
    attemptNote.textContent = 'Attempt ' + attempt

    const matched = findMatchingAnswer(block, learnerValue)
    const postMoveFen = block.mode === 'move' ? widget.getFen() : null

    emitEvent('exercise-attempted', ctx.sectionId, ctx.blockIndex, {
      answer: learnerValue, matched: !!matched, correct: matched ? !!matched.correct : false, attempt,
    })

    analysisCtl.setHidden(false)
    analysisCtl.refresh()

    feedbackEl.hidden = false
    engineFallbackEl.hidden = true

    let landedOn = null
    if (block.mode === 'move') {
      const played = widget.getChess().history({ verbose: true })
      if (played.length) landedOn = played[played.length - 1].to
    }

    function markWrongAndReset() {
      if (landedOn) widget.setVerdict(landedOn, 'wrong')
      setTimeout(() => { if (!solved) { widget.setVerdict(null); widget.setFen(block.fen) } }, WRONG_MOVE_RESET_MS)
    }

    if (matched) {
      feedbackEl.className = 'exercise-feedback ' + (matched.correct ? 'correct' : 'incorrect')
      renderMarkdownInto(feedbackEl, matched.feedback || (matched.correct ? 'Correct.' : 'Not quite.'))
      if (matched.correct) {
        solved = true
        if (landedOn) widget.setVerdict(landedOn, 'right')
        if (block.mode === 'move') widget.setInteractive(false)
        revealExplanation()
        emitEvent('exercise-solved', ctx.sectionId, ctx.blockIndex, { answer: learnerValue, attempt })
        markSectionProgress(ctx.sectionId, 'done')
      } else if (block.mode === 'move') markWrongAndReset()
    } else {
      feedbackEl.className = 'exercise-feedback fallback'
      feedbackEl.textContent = 'Not one of the lines I anticipated.'
      showEngineFallback(postMoveFen, displayLabel)
      revealExplanation()
      if (block.mode === 'move') markWrongAndReset()
    }
  }

  function findMatchingAnswer(block, learnerValue) {
    const answers = block.answers || []
    if (block.mode === 'move') {
      for (const a of answers) if (a.move && movesEquivalent(block.fen, learnerValue, a.move)) return a
    } else if (block.mode === 'text') {
      const norm = normalizeAnswerText(learnerValue)
      for (const a of answers) if (a.text && normalizeAnswerText(a.text) === norm) return a
    } else if (block.mode === 'choice') {
      for (const a of answers) if (a.option === learnerValue) return a
    }
    return null
  }

  return wrap
}

function createAskAboutButton(sectionHeading, blockType, sectionId, blockIndex) {
  const btn = document.createElement('button')
  btn.type = 'button'; btn.className = 'ask-about'
  btn.textContent = 'Ask about this'
  btn.setAttribute('aria-label', 'Ask the coach about this ' + blockType + ' block')
  btn.addEventListener('click', () => {
    // This will be wired up by the shell
    btn.dispatchEvent(new CustomEvent('ask-about', { detail: { sectionHeading, blockType, sectionId, blockIndex } }))
  })
  return btn
}