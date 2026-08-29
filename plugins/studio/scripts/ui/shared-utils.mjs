// The learner's escape hatch: the thing to press when the authored feedback
// did not cover what they actually want to ask. It has exactly one definition
// because three separate copies of it is how one of them ends up not working.
//
// The event bubbles. A shell attaches a single listener to the chapter root —
// it has no handle on a button buried inside a block it did not build — and a
// non-bubbling event dispatched on the button is one nothing can ever hear,
// which makes this a live control that silently does nothing.
export function createAskAboutButton(sectionHeading, blockType, sectionId, blockIndex) {
  const btn = document.createElement('button')
  btn.type = 'button'; btn.className = 'ask-about'
  btn.textContent = 'Ask about this'
  btn.setAttribute('aria-label', 'Ask the coach about this ' + blockType + ' block')
  btn.addEventListener('click', () => {
    btn.dispatchEvent(new CustomEvent('ask-about', {
      bubbles: true,
      detail: { sectionHeading, blockType, sectionId, blockIndex },
    }))
  })
  return btn
}

export function createBlockWrapper(extraClass, ctx, blockType) {
  const wrap = document.createElement('div')
  wrap.className = 'block ' + extraClass
  wrap.appendChild(createAskAboutButton(ctx.sectionHeading, blockType, ctx.sectionId, ctx.blockIndex))
  return wrap
}