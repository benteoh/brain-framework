export function createAskAboutButton(sectionHeading, blockType, sectionId, blockIndex) {
  const btn = document.createElement('button')
  btn.type = 'button'; btn.className = 'ask-about'
  btn.textContent = 'Ask about this'
  btn.setAttribute('aria-label', 'Ask the coach about this ' + blockType + ' block')
  btn.addEventListener('click', () => btn.dispatchEvent(new CustomEvent('ask-about', { detail: { sectionHeading, blockType, sectionId, blockIndex } })))
  return btn
}

export function createBlockWrapper(extraClass, ctx, blockType) {
  const wrap = document.createElement('div')
  wrap.className = 'block ' + extraClass
  wrap.appendChild(createAskAboutButton(ctx.sectionHeading, blockType, ctx.sectionId, ctx.blockIndex))
  return wrap
}