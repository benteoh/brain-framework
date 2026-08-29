import { renderMarkdownInto, escapeText } from './markdown.mjs'
import { createBlockWrapper } from './shared-utils.mjs'

const CALLOUT_TITLES = { principle: 'Principle', theory: 'Theory', warning: 'Warning', insight: 'Insight' }
const CALLOUT_VARIANTS = ['principle', 'theory', 'warning', 'insight']

export function createCalloutBlock(block, ctx) {
  const variant = CALLOUT_VARIANTS.includes(block.variant) ? block.variant : 'theory'
  const wrap = createBlockWrapper('block-callout', ctx, 'callout')
  const box = document.createElement('div')
  box.className = 'callout callout-' + variant
  const title = document.createElement('div')
  title.className = 'callout-title'
  escapeText(title, block.title || CALLOUT_TITLES[variant])
  box.appendChild(title)
  const body = document.createElement('div')
  body.className = 'prose'
  renderMarkdownInto(body, block.body)
  box.appendChild(body)
  wrap.appendChild(box)
  return wrap
}