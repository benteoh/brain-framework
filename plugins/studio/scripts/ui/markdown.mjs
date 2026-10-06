export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

function splitRow(line) {
  let t = line.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|')) t = t.slice(0, -1)
  return t.split('|').map(s => s.trim())
}

function isTableDelimiter(line) {
  const t = line.trim()
  if (!/^[\s\|\-\:]+$/.test(t)) return false
  return /---/.test(t)
}

function renderTable(headerCells, rows) {
  let out = '<div class="table-wrap"><table><thead><tr>'
  for (const c of headerCells) out += '<th>' + renderInlineMarkdown(c) + '</th>'
  out += '</tr></thead><tbody>'
  for (const rowCells of rows) {
    out += '<tr>'
    for (let i = 0; i < headerCells.length; i++) {
      const cell = rowCells[i] !== undefined ? rowCells[i] : ''
      out += '<td>' + renderInlineMarkdown(cell) + '</td>'
    }
    out += '</tr>'
  }
  out += '</tbody></table></div>'
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) { flushPara(); flushList(); continue }
    // Fenced code block: ``` or ~~~ (3+), with an optional language info string.
    // The body is emitted verbatim — the whole source was HTML-escaped up front,
    // so blank lines and indentation survive instead of collapsing into a paragraph.
    const fence = trimmed.match(/^(`{3,}|~{3,})\s*(.*)$/)
    if (fence) {
      flushPara(); flushList()
      const fenceChar = fence[1][0]
      const fenceLen = fence[1].length
      const info = fence[2].trim().split(/\s+/)[0]
      const langClass = info ? ' class="language-' + info.replace(/[^\w-]/g, '') + '"' : ''
      const closeRe = new RegExp('^' + fenceChar + '{' + fenceLen + ',}\\s*$')
      const body = []
      let j = i + 1
      while (j < lines.length && !closeRe.test(lines[j].trim())) { body.push(lines[j]); j++ }
      html += '<pre class="code-block"><code' + langClass + '>' + body.join('\n') + '</code></pre>'
      i = j
      continue
    }
    // Table detection: header line with | + delimiter next line
    if (trimmed.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
      flushPara(); flushList()
      const headerCells = splitRow(trimmed)
      // skip delimiter line
      i++
      const rows = []
      let j = i + 1
      while (j < lines.length) {
        const rowTrim = lines[j].trim()
        if (!rowTrim) break
        if (!rowTrim.includes('|')) break
        if (isTableDelimiter(rowTrim)) break
        // stop if looks like heading or list start without pipe? but pipe check already handles
        rows.push(splitRow(rowTrim))
        j++
      }
      html += renderTable(headerCells, rows)
      i = j - 1
      continue
    }
    let m
    if ((m = trimmed.match(/^###\s+(.*)$/))) { flushPara(); flushList(); html += '<h3>' + renderInlineMarkdown(m[1]) + '</h3>'; continue }
    if ((m = trimmed.match(/^##\s+(.*)$/))) { flushPara(); flushList(); html += '<h2>' + renderInlineMarkdown(m[1]) + '</h2>'; continue }
    if ((m = trimmed.match(/^&gt;\s+(.*)$/))) { flushPara(); flushList(); html += '<blockquote>' + renderInlineMarkdown(m[1]) + '</blockquote>'; continue }
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
