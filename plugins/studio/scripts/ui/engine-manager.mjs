const ENGINE_ASSET_MULTI = '/assets/stockfish-18-lite.js'
const ENGINE_ASSET_SINGLE = '/assets/stockfish-18-lite-single.js'
const ENGINE_BOOT_TIMEOUT_MS = 10000

function tryBoot(url) {
  return new Promise((resolve, reject) => {
    let settled = false
    let w
    try { w = new Worker(url) } catch (err) { reject(err); return }
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      try { w.terminate() } catch (e) {}
      reject(new Error('engine boot timeout: ' + url))
    }, ENGINE_BOOT_TIMEOUT_MS)

    w.onerror = err => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      try { w.terminate() } catch (e) {}
      reject(err)
    }
    w.onmessage = e => {
      const line = typeof e.data === 'string' ? e.data : ''
      if (line.indexOf('uciok') !== -1) {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        w.onmessage = handleMessage
        w.postMessage('isready')
        resolve(w)
      }
    }
    try { w.postMessage('uci') } catch (err) { clearTimeout(timeout); reject(err) }
  })
}

function parseInfoLine(line) {
  const depthMatch = line.match(/\bdepth (\d+)/)
  const multipvMatch = line.match(/\bmultipv (\d+)/)
  const cpMatch = line.match(/\bscore cp (-?\d+)/)
  const mateMatch = line.match(/\bscore mate (-?\d+)/)
  const pvMatch = line.match(/\bpv (.+)$/)
  if (!depthMatch || line.indexOf(' score ') === -1) return null
  return {
    depth: Number(depthMatch[1]),
    multipv: multipvMatch ? Number(multipvMatch[1]) : 1,
    cp: cpMatch ? Number(cpMatch[1]) : null,
    mate: mateMatch ? Number(mateMatch[1]) : null,
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : [],
  }
}

let worker = null
let available = null
let bootPromise = null
let busy = false
let currentJob = null
let pendingJob = null
const listeners = []
let activeEngineName = null

function notify() { listeners.forEach(fn => { try { fn(available) } catch (e) {} }) }

export function onAvailability(fn) {
  listeners.push(fn)
  if (available !== null) fn(available)
  return () => { const idx = listeners.indexOf(fn); if (idx >= 0) listeners.splice(idx, 1) }
}

async function bootOnce() {
  if (bootPromise) return bootPromise
  const preferred = (typeof window !== 'undefined' && window.crossOriginIsolated) ? ENGINE_ASSET_MULTI : ENGINE_ASSET_SINGLE
  bootPromise = tryBoot(preferred).then(w => {
    worker = w; available = true; activeEngineName = preferred; notify(); return true
  }).catch(() => {
    if (preferred === ENGINE_ASSET_SINGLE) { available = false; notify(); return false }
    return tryBoot(ENGINE_ASSET_SINGLE).then(w => {
      worker = w; available = true; activeEngineName = ENGINE_ASSET_SINGLE; notify(); return true
    }).catch(() => { available = false; notify(); return false })
  })
  return bootPromise
}

function handleMessage(e) {
  const line = typeof e.data === 'string' ? e.data : ''
  if (!currentJob) return
  if (line.indexOf('info') === 0 && line.indexOf(' score ') !== -1) {
    const info = parseInfoLine(line)
    if (info) {
      currentJob.lines.set(info.multipv, info)
      if (typeof currentJob.onInfo === 'function') {
        const arr = Array.from(currentJob.lines.values()).sort((a, b) => a.multipv - b.multipv)
        currentJob.onInfo(arr)
      }
    }
  } else if (line.indexOf('bestmove') === 0) {
    const parts = line.split(/\s+/)
    const best = parts[1] === '(none)' ? null : parts[1]
    const finished = currentJob
    currentJob = null
    busy = false
    if (finished && typeof finished.onBest === 'function') {
      const lines = Array.from(finished.lines.values()).sort((a, b) => a.multipv - b.multipv)
      finished.onBest(best, lines)
    }
    if (pendingJob) {
      const next = pendingJob
      pendingJob = null
      runJob(next)
    }
  }
}

function runJob(job) {
  busy = true
  currentJob = job
  job.lines = new Map()
  worker.postMessage('stop')
  worker.postMessage('setoption name MultiPV value ' + (job.multipv || 1))
  worker.postMessage('position fen ' + job.fen)
  worker.postMessage('go depth ' + (job.depth || 18))
}

export function request(fen, opts = {}) {
  const job = { fen, depth: opts.depth || 18, multipv: opts.multipv || 1, onInfo: opts.onInfo, onBest: opts.onBest }
  return bootOnce().then(ok => {
    if (!ok) return false
    if (busy) { worker.postMessage('stop'); pendingJob = job }
    else runJob(job)
    return true
  })
}

export function cancelPending() {
  pendingJob = null
  if (busy && worker) { try { worker.postMessage('stop') } catch (e) {} }
}

export function isAvailable() { return available }
export function engineName() { return activeEngineName }
export function boot() { return bootOnce() }