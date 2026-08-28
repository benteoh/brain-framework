import { createBoardWidget } from './board-widget-factory.mjs'
import { attachLiveAnalysis } from './live-analysis.mjs'
import { analyzeOnce, engineUnavailableNote } from './engine-fallback.mjs'
import { uciPvToSan, fmtScore } from './eval-bar.mjs'
import { movesEquivalent, normalizeAnswerText } from './exercise-utils.mjs'
import { renderMarkdownInto } from './markdown.mjs'
import { createAskAboutButton } from './shared-utils.mjs'

const WRONG_MOVE_RESET_MS = 1100

// Both scores are white-relative, so the mover's loss is the drop measured in
// their own direction. Mate scores are not centipawns and are not subtracted.
export function evalLossCp(bestInfo, playedInfo, fen) {
  if (!bestInfo || !playedInfo) return null
  if (bestInfo.mateWhite != null || playedInfo.mateWhite != null) return null
  if (bestInfo.cpWhite == null || playedInfo.cpWhite == null) return null
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1
  return Math.max(0, (bestInfo.cpWhite - playedInfo.cpWhite) * sign)
}

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
  let revealed = false
  let hintIndex = 0
  let pendingBestMove = null

  const widget = createBoardWidget({
    fen: block.fen,
    orientation: block.orientation,
    interactive: block.mode === 'move',
    ariaPrefix: 'Exercise board',
    onMove: (result) => { if (!solved && !revealed) commit(result.san, result.san) },
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
    form.addEventListener('submit', ev => {
      ev.preventDefault()
      if (solved || revealed || !input.value.trim()) return
      commit(input.value.trim(), input.value.trim())
    })
    wrap.appendChild(form)
  } else if (block.mode === 'choice') {
    const optionsWrap = document.createElement('div')
    optionsWrap.className = 'exercise-options'
    ;(block.options || []).forEach(optionText => {
      const btn = document.createElement('button')
      btn.type = 'button'; btn.className = 'exercise-option'
      renderMarkdownInto(btn, optionText)
      btn.addEventListener('click', () => { if (!solved && !revealed) commit(optionText, optionText) })
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
  engineFallbackEl.setAttribute('aria-live', 'polite')
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

  // Without this an unsolved exercise is a dead end: the learner cannot see the
  // answer, cannot mark the section done, and the only exit is to guess until
  // something sticks. It is deliberately a separate, explicit act rather than
  // something a wrong attempt triggers, so that choosing to stop working on a
  // problem is visible to the learner and to the debrief.
  const revealBtn = document.createElement('button')
  revealBtn.type = 'button'; revealBtn.className = 'reveal-btn'
  revealBtn.textContent = 'Show me the answer'
  revealBtn.hidden = true
  wrap.appendChild(revealBtn)
  revealBtn.addEventListener('click', () => {
    if (solved || revealed) return
    closeExercise('revealed')
    emitEvent('exercise-revealed', ctx.sectionId, ctx.blockIndex, { attempt, hintsUsed: hintIndex })
  })

  // Closing is the single place the answer becomes visible: the authored
  // explanation, the engine's best move, and the eval bar. All of it stays
  // hidden while the exercise is still live, because an exercise whose answer
  // is one wrong guess or one glance at the eval bar away is not an exercise.
  function closeExercise(how) {
    if (how === 'solved') solved = true
    else revealed = true
    revealBtn.hidden = true
    if (block.mode === 'move') widget.setInteractive(false)
    analysisCtl.setHidden(false)
    analysisCtl.refresh()
    if (pendingBestMove) {
      engineFallbackEl.hidden = false
      engineFallbackEl.textContent = `${engineFallbackEl.textContent} The engine plays ${pendingBestMove}.`
      pendingBestMove = null
    }
    revealExplanation()
    markSectionProgress(ctx.sectionId, 'done')
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

  // The unanticipated-answer path. It has to say something useful without
  // becoming a way to buy the answer: naming the engine's best move here would
  // make one throwaway move the cheapest route to the solution. So it reports
  // what the move cost against the best available and holds the move itself
  // back for closeExercise().
  function showEngineFallback(playedFen, playedLabel) {
    engineFallbackEl.hidden = false
    engineFallbackEl.textContent = 'Not one of the lines I anticipated — checking with the engine…'
    Promise.all([analyzeOnce(block.fen, 18), playedFen ? analyzeOnce(playedFen, 18) : Promise.resolve(null)])
      .then(([bestInfo, playedInfo]) => {
        if (!bestInfo && !playedInfo) {
          engineFallbackEl.textContent = 'The live engine is unavailable, so no automatic comparison here — ask the coach if you want to talk it through.'
          return
        }
        if (bestInfo && bestInfo.best) pendingBestMove = uciPvToSan(block.fen, [bestInfo.best])
        const parts = []
        if (playedInfo && playedLabel) {
          parts.push(`Your move (${playedLabel}) is worth ${fmtScore(playedInfo.cpWhite, playedInfo.mateWhite)} at depth ${playedInfo.depth}.`)
        }
        if (bestInfo) {
          parts.push(`The best move here is worth ${fmtScore(bestInfo.cpWhite, bestInfo.mateWhite)} at depth ${bestInfo.depth}.`)
          const loss = evalLossCp(bestInfo, playedInfo, block.fen)
          if (loss !== null) {
            parts.push(loss < 25
              ? 'That is close enough to be a real alternative.'
              : `That is a gap of about ${(loss / 100).toFixed(1)} pawns — there is more here.`)
          }
        }
        engineFallbackEl.textContent = parts.join(' ')
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

    feedbackEl.hidden = false
    engineFallbackEl.hidden = true

    let landedOn = null
    if (block.mode === 'move') {
      const played = widget.getChess().history({ verbose: true })
      if (played.length) landedOn = played[played.length - 1].to
    }

    function markWrongAndReset() {
      if (landedOn) widget.setVerdict(landedOn, 'wrong')
      setTimeout(() => { if (!solved && !revealed) { widget.setVerdict(null); widget.setFen(block.fen) } }, WRONG_MOVE_RESET_MS)
    }

    if (matched) {
      feedbackEl.className = 'exercise-feedback ' + (matched.correct ? 'correct' : 'incorrect')
      renderMarkdownInto(feedbackEl, matched.feedback || (matched.correct ? 'Correct.' : 'Not quite.'))
      if (matched.correct) {
        if (landedOn) widget.setVerdict(landedOn, 'right')
        closeExercise('solved')
        emitEvent('exercise-solved', ctx.sectionId, ctx.blockIndex, { answer: learnerValue, attempt })
      } else {
        // An anticipated wrong answer is the one worth the most: the author
        // already wrote feedback for exactly this misconception, and the
        // learner can use it on a retry. So the exercise stays open and the
        // answer stays hidden.
        revealBtn.hidden = false
        if (block.mode === 'move') markWrongAndReset()
      }
    } else {
      feedbackEl.className = 'exercise-feedback fallback'
      feedbackEl.textContent = 'Not one of the lines I anticipated.'
      showEngineFallback(postMoveFen, displayLabel)
      revealBtn.hidden = false
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
