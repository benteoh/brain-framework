export function clamp(n, min, max) { return Math.min(Math.max(n, min), max) }

export function fmtScore(cp, mate) {
  if (typeof mate === 'number' && mate !== null) return mate > 0 ? 'M' + mate : '-M' + Math.abs(mate)
  if (typeof cp !== 'number' || cp === null || isNaN(cp)) return '—'
  const pawns = cp / 100
  const sign = pawns > 0 ? '+' : (pawns < 0 ? '' : '±')
  return sign + pawns.toFixed(2)
}

export function normalizeToWhite(cp, mate, turnIsWhite) {
  const sign = turnIsWhite ? 1 : -1
  return { cp: typeof cp === 'number' ? cp * sign : null, mate: typeof mate === 'number' ? mate * sign : null }
}

export function createEvalBar() {
  const wrap = document.createElement('div')
  wrap.className = 'eval-bar-wrap'
  const bar = document.createElement('div')
  bar.className = 'eval-bar'
  bar.setAttribute('role', 'img')
  bar.setAttribute('aria-label', 'Evaluation bar')
  const fill = document.createElement('div')
  fill.className = 'eval-bar-fill'
  fill.style.height = '50%'
  bar.appendChild(fill)
  const label = document.createElement('div')
  label.className = 'eval-label'
  wrap.appendChild(bar); wrap.appendChild(label)

  function update(info) {
    if (!info) { bar.classList.remove('thinking'); fill.style.height = '50%'; label.textContent = ''; return }
    if (info.thinking) bar.classList.add('thinking'); else bar.classList.remove('thinking')
    let pct
    if (typeof info.mateWhite === 'number' && info.mateWhite !== null) pct = info.mateWhite > 0 ? 100 : 0
    else if (typeof info.cpWhite === 'number' && info.cpWhite !== null) {
      const pawns = clamp(info.cpWhite / 100, -5, 5)
      pct = 50 + (pawns / 5) * 50
    } else pct = 50
    fill.style.height = pct + '%'
    const scoreText = fmtScore(info.cpWhite, info.mateWhite)
    label.textContent = info.depth ? (scoreText + '  d' + info.depth) : scoreText
    bar.setAttribute('aria-label', 'Evaluation ' + scoreText + (info.depth ? (' at depth ' + info.depth) : ''))
  }
  return { el: wrap, update }
}

export function createTopLinesPanel() {
  const details = document.createElement('details')
  details.className = 'top-lines'
  const summary = document.createElement('summary')
  summary.textContent = 'Top lines'
  const ol = document.createElement('ol')
  details.appendChild(summary); details.appendChild(ol)

  function update(fen, lines) {
    ol.innerHTML = ''
    ;(lines || []).forEach(line => {
      const li = document.createElement('li')
      const evalSpan = document.createElement('span')
      evalSpan.className = 'pv-eval'
      evalSpan.textContent = fmtScore(line.cpWhite, line.mateWhite)
      const sanSpan = document.createElement('span')
      sanSpan.textContent = uciPvToSan(fen, line.pv, 6)
      li.appendChild(evalSpan); li.appendChild(sanSpan)
      ol.appendChild(li)
    })
  }
  return { el: details, update }
}

export function uciToMoveParts(uci) {
  if (!uci || uci.length < 4) return null
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined }
}

export function uciPvToSan(Chess, fen, pvUci, maxMoves) {
  const replay = new Chess(fen)
  const out = []
  const tokens = (pvUci || []).slice(0, maxMoves || 6)
  for (const uci of tokens) {
    const parts = uciToMoveParts(uci)
    if (!parts) break
    const result = replay.move({ from: parts.from, to: parts.to, promotion: parts.promotion })
    if (!result) { out.push('…'); break }
    out.push(result.san)
  }
  return out.join(' ')
}