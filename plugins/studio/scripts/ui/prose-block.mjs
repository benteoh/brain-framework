import { renderMarkdownInto } from './markdown.mjs'
import { createBlockWrapper } from './shared-utils.mjs'

export function createProseBlock(block, ctx) {
  const wrap = createBlockWrapper('block-prose', ctx, 'prose')
  const div = document.createElement('div')
  div.className = 'prose'
  renderMarkdownInto(div, block.body)
  wrap.appendChild(div)
  return wrap
}