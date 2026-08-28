import { setInlineMarkdown } from './markdown.mjs'
import { createAskAboutButton } from './shared-utils.mjs'

export function createRecapBlock(block, ctx) {
  const wrap = document.createElement('div')
  wrap.className = 'block block-recap'
  wrap.appendChild(createAskAboutButton(ctx.sectionHeading, 'recap', ctx.sectionId, ctx.blockIndex))

  const ul = document.createElement('ul')
  ul.className = 'recap-list'
  ;(block.points || []).forEach(point => {
    const li = document.createElement('li')
    setInlineMarkdown(li, point)
    ul.appendChild(li)
  })
  wrap.appendChild(ul)
  return wrap
}