#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

// Pure retrieval from the public Chess.com API: no auth, no judgement, no
// engine. Everything written here is a deterministic fact about what was
// played, which is what `references/evidence.md` requires of this layer.

const USER_AGENT = 'brain-framework coach/chess (https://github.com/benteoh/brain-framework)'

async function getJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
  if (response.status === 404) throw new Error(`Not found: ${url}`)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return response.json()
}

function gameId(url) {
  const tail = String(url).split('/').filter(Boolean).pop()
  return /^\d+$/.test(tail) ? tail : String(url).replace(/[^a-z0-9]+/gi, '-').slice(-40)
}

function outcome(resultCode) {
  if (resultCode === 'win') return 'win'
  if (['checkmated', 'timeout', 'resigned', 'lose', 'abandoned', 'bughousepartnerlose', 'threecheck', 'kingofthehill'].includes(resultCode)) {
    return 'loss'
  }
  return 'draw'
}

function tagValue(pgn, tag) {
  const match = new RegExp(`\\[${tag} "([^"]*)"\\]`).exec(pgn)
  return match ? match[1] : null
}

export function summarise(game, handle) {
  const lower = handle.toLowerCase()
  const playedWhite = game.white.username.toLowerCase() === lower
  const me = playedWhite ? game.white : game.black
  const them = playedWhite ? game.black : game.white
  return {
    id: gameId(game.url),
    url: game.url,
    playedAt: new Date(game.end_time * 1000).toISOString(),
    colour: playedWhite ? 'white' : 'black',
    result: outcome(me.result),
    resultCode: me.result,
    opponent: them.username,
    opponentRating: them.rating ?? null,
    myRating: me.rating ?? null,
    rated: Boolean(game.rated),
    timeClass: game.time_class ?? null,
    timeControl: game.time_control ?? null,
    eco: tagValue(game.pgn ?? '', 'ECO'),
    opening: (tagValue(game.pgn ?? '', 'ECOUrl') ?? '').split('/').pop()?.replace(/-/g, ' ') || null,
    termination: tagValue(game.pgn ?? '', 'Termination'),
    pgnFile: `${gameId(game.url)}.pgn`,
  }
}

export async function fetchGames({ handle, last = 30, since, fetchJson = getJson }) {
  const { archives } = await fetchJson(`https://api.chess.com/pub/player/${encodeURIComponent(handle)}/games/archives`)
  const wanted = since ? archives.filter((url) => url.slice(-7) >= since.replace('-', '/')) : archives
  const collected = []
  // Newest archive first, so `--last N` costs one request per month walked back
  // rather than downloading the player's whole history.
  for (const url of [...wanted].reverse()) {
    const { games } = await fetchJson(url)
    for (const game of games.reverse()) {
      if (game.rules && game.rules !== 'chess') continue
      if (!game.pgn) continue
      collected.push(game)
      if (collected.length >= last) return collected
    }
  }
  return collected
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      user: { type: 'string' },
      last: { type: 'string', default: '30' },
      since: { type: 'string' },
      out: { type: 'string', default: 'Learning/Chess/Games' },
    },
  })
  if (!values.user) {
    console.error('Usage: chesscom.mjs --user <handle> [--last N] [--since YYYY-MM] [--out dir]')
    process.exitCode = 1
    return
  }

  const outDir = path.resolve(values.out)
  await mkdir(outDir, { recursive: true })

  const games = await fetchGames({ handle: values.user, last: Number(values.last), since: values.since })
  const index = []
  for (const game of games) {
    const entry = summarise(game, values.user)
    await writeFile(path.join(outDir, entry.pgnFile), `${game.pgn.trim()}\n`)
    index.push(entry)
  }
  index.sort((a, b) => b.playedAt.localeCompare(a.playedAt))

  const indexPath = path.join(outDir, 'index.json')
  await writeFile(
    indexPath,
    `${JSON.stringify({ handle: values.user, fetchedAt: new Date().toISOString(), source: 'api.chess.com', games: index }, null, 2)}\n`,
  )

  const wins = index.filter((g) => g.result === 'win').length
  const losses = index.filter((g) => g.result === 'loss').length
  console.error(`Saved ${index.length} games to ${outDir} (${wins}W ${losses}L ${index.length - wins - losses}D)`)
  console.error(`Index: ${indexPath}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
