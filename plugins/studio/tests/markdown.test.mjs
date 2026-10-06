import assert from 'node:assert/strict'
import test from 'node:test'

import { renderMarkdown } from '../scripts/ui/markdown.mjs'

test('renders a fenced code block preserving blank lines and indentation', () => {
  const md = 'Before.\n\n```js\nconst x = 1;\n\nfunction f() {\n  return x;\n}\n```\n\nAfter.'
  const html = renderMarkdown(md)
  assert.match(html, /<pre class="code-block"><code class="language-js">/)
  assert.match(html, /const x = 1;\n\nfunction f\(\) \{\n  return x;\n\}/)
  assert.ok(!html.includes('```'), 'fence markers must not leak into output')
  assert.ok(!html.includes('<p>```'), 'fence must not be treated as a paragraph')
  assert.match(html, /<p>Before\.<\/p>/)
  assert.match(html, /<p>After\.<\/p>/)
})

test('fenced code content is not re-parsed as tables, headings, or lists', () => {
  const md = '```\n| a | b |\n| - | - |\n## not a heading\n- not a list\n```'
  const html = renderMarkdown(md)
  assert.ok(!html.includes('<table'), 'pipes inside code must not become a table')
  assert.ok(!html.includes('<h2>'), 'hashes inside code must not become a heading')
  assert.ok(!html.includes('<ul>'), 'dashes inside code must not become a list')
  assert.match(html, /\| a \| b \|/)
  assert.match(html, /## not a heading/)
})

test('supports tilde fences and a language info string', () => {
  const html = renderMarkdown('~~~python\nprint("hi")\n~~~')
  assert.match(html, /<code class="language-python">print\(&quot;hi&quot;\)<\/code>/)
})

test('an unclosed fence renders the remaining lines as code rather than dropping them', () => {
  const html = renderMarkdown('```\nstill code')
  assert.match(html, /<pre class="code-block">/)
  assert.match(html, /still code/)
})

test('inline code is escaped and still rendered as <code>', () => {
  const html = renderMarkdown('Use `foo < bar` here.')
  assert.match(html, /<code>foo &lt; bar<\/code>/)
  assert.ok(!html.includes('<pre'), 'inline code must not become a block')
})

test('a code fence without an info string omits the language class', () => {
  const html = renderMarkdown('```\nplain\n```')
  assert.match(html, /<pre class="code-block"><code>plain<\/code><\/pre>/)
})
