import assert from 'node:assert/strict'
import test from 'node:test'

import { phaseOf, summariseGame } from '../skills/chess/scripts/analyse.mjs'
import { fetchGames, summarise } from '../skills/chess/scripts/chesscom.mjs'
import { boardDiagram, renderChapter } from '../../studio/scripts/render-chapter-md.mjs'

function ply(overrides) {
  return {
    byLearner: true,
    classification: 'ok',
    cpLoss: 0,
    accuracy: 100,
    phase: 'middlegame',
    tags: [],
    ...overrides,
  }
}

test('summariseGame counts only the learner\'s own moves', () => {
  const summary = summariseGame(
    [
      ply({ classification: 'blunder', cpLoss: 400, accuracy: 20 }),
      ply({ byLearner: false, classification: 'blunder', cpLoss: 900, accuracy: 5 }),
      ply({ classification: 'best' }),
    ],
    'white',
  )
  assert.equal(summary.moves, 2)
  assert.equal(summary.counts.blunder, 1)
  assert.equal(summary.acpl, 200)
})

test('summariseGame reports accuracy per phase and leaves absent phases null', () => {
  const summary = summariseGame(
    [
      ply({ phase: 'opening', cpLoss: 0, accuracy: 100 }),
      ply({ phase: 'opening', cpLoss: 100, accuracy: 60, classification: 'mistake' }),
      ply({ phase: 'middlegame', cpLoss: 20, accuracy: 90 }),
    ],
    'black',
  )
  assert.equal(summary.byPhase.opening.moves, 2)
  assert.equal(summary.byPhase.opening.acpl, 50)
  assert.equal(summary.byPhase.opening.accuracy, 80)
  assert.equal(summary.byPhase.endgame, null)
  assert.equal(summary.colour, 'black')
})

test('errorTags aggregates tags from errors only, so a good move\'s tags never read as a weakness', () => {
  const summary = summariseGame(
    [
      ply({ classification: 'best', tags: ['best-was-quiet'] }),
      ply({ classification: 'blunder', cpLoss: 300, tags: ['best-was-quiet', 'played-capture'] }),
      ply({ classification: 'mistake', cpLoss: 150, tags: ['best-was-quiet'] }),
    ],
    'white',
  )
  assert.deepEqual(summary.errorTags, { 'best-was-quiet': 2, 'played-capture': 1 })
})

test('a mate blunder cannot dominate the average, but stays raw on the ply itself', () => {
  const summary = summariseGame(
    [
      ply({ classification: 'blunder', cpLoss: 9508, accuracy: 0 }),
      ply({ cpLoss: 0 }),
      ply({ cpLoss: 0 }),
      ply({ cpLoss: 0 }),
    ],
    'white',
  )
  // Capped at 1000, so 1000/4; uncapped this would read as an ACPL of 2377.
  assert.equal(summary.acpl, 250)
})

test('phaseOf uses non-pawn material, so a queen trade alone is not an endgame', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  assert.equal(phaseOf(start, 1), 'opening')

  // Same position minus both queens: 44 points of non-pawn material left.
  assert.equal(phaseOf('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1', 30), 'middlegame')

  // Rook and king each side: 10 points.
  assert.equal(phaseOf('4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1', 60), 'endgame')
})

test('phaseOf leaves the opening once enough moves have been played, even with pieces on', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  assert.equal(phaseOf(start, 25), 'middlegame')
})

test('summariseGame handles a game where the learner made no moves', () => {
  const summary = summariseGame([ply({ byLearner: false })], 'white')
  assert.equal(summary.moves, 0)
  assert.equal(summary.acpl, null)
  assert.equal(summary.accuracy, null)
})

const GAME = {
  url: 'https://www.chess.com/game/live/123456',
  end_time: 1754006400,
  rated: true,
  time_class: 'rapid',
  time_control: '600',
  white: { username: 'Learner', rating: 1180, result: 'win' },
  black: { username: 'Rival', rating: 1205, result: 'resigned' },
  pgn: '[ECO "C50"]\n[ECOUrl "https://www.chess.com/openings/Italian-Game"]\n[Termination "Learner won by resignation"]\n\n1. e4 e5 1-0',
}

test('summarise resolves the learner\'s colour case-insensitively', () => {
  const white = summarise(GAME, 'learner')
  assert.equal(white.colour, 'white')
  assert.equal(white.result, 'win')
  assert.equal(white.opponent, 'Rival')
  assert.equal(white.opponentRating, 1205)

  const black = summarise(GAME, 'rival')
  assert.equal(black.colour, 'black')
  assert.equal(black.result, 'loss')
  assert.equal(black.opponent, 'Learner')
})

test('summarise extracts opening and termination from the PGN tags', () => {
  const entry = summarise(GAME, 'learner')
  assert.equal(entry.eco, 'C50')
  assert.equal(entry.opening, 'Italian Game')
  assert.equal(entry.termination, 'Learner won by resignation')
  assert.equal(entry.id, '123456')
  assert.equal(entry.pgnFile, '123456.pgn')
})

test('fetchGames walks archives newest-first and stops at the requested count', async () => {
  const requested = []
  const fetchJson = async (url) => {
    requested.push(url)
    if (url.endsWith('/archives')) {
      return { archives: ['https://x/2026/06', 'https://x/2026/07', 'https://x/2026/08'] }
    }
    return { games: [{ ...GAME, url: `${url}/a` }, { ...GAME, url: `${url}/b` }] }
  }
  const games = await fetchGames({ handle: 'learner', last: 3, fetchJson })
  assert.equal(games.length, 3)
  assert.equal(requested[1], 'https://x/2026/08', 'newest archive must be requested first')
  assert.equal(requested.length, 3, 'must stop once the count is met, not download every archive')
})

test('fetchGames skips variants and games with no PGN', async () => {
  const fetchJson = async (url) => {
    if (url.endsWith('/archives')) return { archives: ['https://x/2026/08'] }
    return {
      games: [
        { ...GAME, rules: 'chess960' },
        { ...GAME, pgn: undefined },
        { ...GAME, rules: 'chess' },
      ],
    }
  }
  const games = await fetchGames({ handle: 'learner', last: 10, fetchJson })
  assert.equal(games.length, 1)
})

test('boardDiagram renders the starting position, and flips for a black orientation', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const white = boardDiagram(start, 'white').split('\n')
  assert.equal(white[0], '8 ♜ ♞ ♝ ♛ ♚ ♝ ♞ ♜')
  assert.equal(white[7], '1 ♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖')
  assert.equal(white[8], '  a b c d e f g h')

  // Read h->a, so the king (e1) now precedes the queen (d1): the flip mirrors
  // files, it does not merely reverse the rank order.
  const black = boardDiagram(start, 'black').split('\n')
  assert.equal(black[0], '1 ♖ ♘ ♗ ♔ ♕ ♗ ♘ ♖')
  assert.equal(black[8], '  h g f e d c b a')
})

test('boardDiagram expands empty-square runs', () => {
  const middle = boardDiagram('8/8/8/4p3/8/8/8/8 w - - 0 1').split('\n')[3]
  assert.equal(middle, '5 · · · · ♟ · · ·')
})

test('renderChapter keeps exercise answers behind a collapsed block so the Markdown still self-tests', () => {
  const markdown = renderChapter({
    title: 'Forcing moves',
    sections: [
      {
        id: 's1',
        heading: 'Look at checks first',
        blocks: [
          { type: 'prose', body: 'Candidate moves come before calculation.' },
          {
            type: 'exercise',
            fen: '8/8/8/8/8/8/8/K6k w - - 0 1',
            question: 'Best move?',
            answers: [{ move: 'Kb2', correct: true, feedback: 'Only legal try.' }],
            explanation: 'The king has nowhere else to go.',
            hints: ['Count the legal moves.'],
          },
        ],
      },
    ],
  })
  assert.match(markdown, /^# Forcing moves/)
  assert.match(markdown, /## Look at checks first/)
  assert.match(markdown, /<details>\n<summary>Answer<\/summary>/)
  assert.match(markdown, /\*\*Kb2\*\* ✓ — Only legal try\./)
  assert.match(markdown, /<summary>Hints<\/summary>/)
})

test('renderChapter renders the provenance line when present', () => {
  const markdown = renderChapter({
    title: 'T',
    provenance: { engine: 'Stockfish 18 Lite', depth: 20, source: 'chess.com/learner', generatedAt: '2026-08-16' },
    sections: [],
  })
  assert.match(markdown, /Stockfish 18 Lite at depth 20 · chess\.com\/learner · 2026-08-16/)
})

test('renderChapter degrades an unknown block to a comment rather than throwing', () => {
  const markdown = renderChapter({
    title: 'T',
    sections: [{ id: 's', heading: 'H', blocks: [{ type: 'hologram' }] }],
  })
  assert.match(markdown, /unsupported block type: hologram/)
})
