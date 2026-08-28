export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '\x27')
}

export function escapeText(node, text) {
  node.textContent = text == null ? '' : String(text)
}

export function renderInlineMarkdown(escaped) {
  let out = escaped
  out = out.replace(/`([^`]+)`/g, (_, code) => '<code>' + code + '</code>')
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, txt, url) =>
    '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + txt + '</a>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^\w])_([^_]+)_(?!\w)/g, '$1<em>$2</em>')
  return out
}

export function renderMarkdown(src) {
  const escaped = escapeHtml(src)
  const lines = escaped.split(/\r?\n/)
  let html = ''
  let listBuffer = null
  let paraBuffer = []

  function flushList() {
    if (!listBuffer) return
    const tag = listBuffer.type
    html += '<' + tag + '>' + listBuffer.items.map(it => '<li>' + renderInlineMarkdown(it) + '</li>').join('') + '</' + tag + '>'
    listBuffer = null
  }
  function flushPara() {
    if (paraBuffer.length) {
      html += '<p>' + renderInlineMarkdown(paraBuffer.join(' ')) + '</p>'
      paraBuffer = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { flushPara(); flushList(); continue }
    let m
    if ((m = trimmed.match(/^###\s+(.*)$/))) { flushPara(); flushList(); html += '<h3>' + renderInlineMarkdown(m[1]) + '</h3>'; continue }
    if ((m = trimmed.match(/^##\s+(.*)$/))) { flushPara(); flushList(); html += '<h2>' + renderInlineMarkdown(m[1]) + '</h2>'; continue }
    if ((m = trimmed.match(/^-\s+(.*)$/))) { flushPara(); if (!listBuffer || listBuffer.type !== 'ul') { flushList(); listBuffer = { type: 'ul', items: [] } }; listBuffer.items.push(m[1]); continue }
    if ((m = trimmed.match(/^\d+\.\s+(.*)$/))) { flushPara(); if (!listBuffer || listBuffer.type !== 'ol') { flushList(); listBuffer = { type: 'ol', items: [] } }; listBuffer.items.push(m[1]); continue }
    flushList()
    paraBuffer.push(trimmed)
  }
  flushPara(); flushList()
  return html
}

export function renderMarkdownInto(el, src) {
  el.innerHTML = renderMarkdown(src == null ? '' : src)
}

export function setInlineMarkdown(el, text) {
  el.innerHTML = renderInlineMarkdown(escapeHtml(text == null ? '' : text))
}

export function details(summary, body) {
  return '<details>\n<summary>' + summary + '</summary>\n\n' + body + '\n\n</details>'
}
