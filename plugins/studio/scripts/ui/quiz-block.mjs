import { renderMarkdownInto, setInlineMarkdown } from './markdown.mjs'
import { createAskAboutButton } from './shared-utils.mjs'

export function createQuizBlock(block, ctx, emitEvent, markSectionProgress) {
  const wrap = document.createElement('div')
  wrap.className = 'block block-quiz'
  wrap.appendChild(createAskAboutButton(ctx.sectionHeading, 'quiz', ctx.sectionId, ctx.blockIndex))

  const question = document.createElement('p')
  question.className = 'quiz-question'
  setInlineMarkdown(question, block.question)
  wrap.appendChild(question)

  const optionsWrap = document.createElement('div')
  optionsWrap.className = 'quiz-options'
  let attempt = 0

  ;(block.options || []).forEach((opt, optIndex) => {
    const row = document.createElement('div')
    const optEl = document.createElement('button')
    optEl.type = 'button'; optEl.className = 'exercise-option'
    setInlineMarkdown(optEl, opt.text)
    const feedbackEl = document.createElement('div')
    feedbackEl.className = 'quiz-option-feedback'; feedbackEl.hidden = true
    row.appendChild(optEl); row.appendChild(feedbackEl)
    optionsWrap.appendChild(row)

    optEl.addEventListener('click', () => {
      attempt++
      optionsWrap.querySelectorAll('.exercise-option').forEach(el => { el.classList.remove('correct', 'incorrect') })
      optionsWrap.querySelectorAll('.quiz-option-feedback').forEach(el => { el.hidden = true })
      optEl.classList.add(opt.correct ? 'correct' : 'incorrect')
      feedbackEl.hidden = false
      setInlineMarkdown(feedbackEl, opt.feedback || (opt.correct ? 'Correct.' : 'Not quite — try another option.'))
      emitEvent('quiz-answered', ctx.sectionId, ctx.blockIndex, { optionIndex: optIndex, correct: !!opt.correct, attempt })
      if (opt.correct) markSectionProgress(ctx.sectionId, 'done')
    })
  })
  wrap.appendChild(optionsWrap)
  return wrap
}