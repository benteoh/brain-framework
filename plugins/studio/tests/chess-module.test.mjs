import assert from 'node:assert/strict'
import test from 'node:test'

import { Chess } from '../scripts/ui/chess.mjs'

// chess.mjs is the browser-side legal-move engine shared by every board widget.
// It was once hand-converted to a class whose public-API stubs called themselves
// (clear() { return this.clear() }), so `new Chess()` blew the stack in the
// constructor. These tests pin the public surface the widgets actually use.

test('constructs the starting position without recursing', () => {
  const chess = new Chess()
  assert.equal(chess.turn(), 'w')
  assert.equal(chess.fen().split(' ')[0], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')
})

test('constructs from an explicit FEN', () => {
  const chess = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')
  assert.equal(chess.turn(), 'b')
})

test('applies a move by from/to and flips the turn', () => {
  const chess = new Chess()
  const move = chess.move({ from: 'e2', to: 'e4' })
  assert.equal(move.san, 'e4')
  assert.equal(chess.turn(), 'b')
})

test('applies a move by SAN, sloppy', () => {
  const chess = new Chess()
  const move = chess.move('Nf3', { sloppy: true })
  assert.equal(move.san, 'Nf3')
})

test('rejects an illegal move with null rather than mutating state', () => {
  const chess = new Chess()
  chess.move({ from: 'e2', to: 'e4' })
  assert.equal(chess.move({ from: 'e2', to: 'e5' }), null)
  assert.equal(chess.turn(), 'b')
})

test('lists legal destinations for a selected square', () => {
  const chess = new Chess()
  const moves = chess.moves({ square: 'e2', verbose: true })
  const tos = moves.map((m) => m.to)
  assert.ok(tos.includes('e3'))
  assert.ok(tos.includes('e4'))
  assert.equal(moves.length, 2)
})

test('get returns piece type and color', () => {
  const chess = new Chess()
  assert.deepEqual(chess.get('e1'), { type: 'k', color: 'w' })
  assert.equal(chess.get('e4'), null)
})

test('reports check from a fools-mate sequence', () => {
  const chess = new Chess()
  chess.move('f3'); chess.move('e5')
  chess.move('g4'); const last = chess.move('Qh4')
  assert.equal(last.san, 'Qh4#')
  assert.equal(chess.in_check(), true)
  assert.equal(chess.in_checkmate(), true)
})

test('history round-trips with before/after FENs for replay', () => {
  const chess = new Chess()
  chess.move('e4'); chess.move('e5')
  const history = chess.history({ verbose: true })
  assert.equal(history.length, 2)
  assert.equal(history[0].san, 'e4')
  assert.equal(history[1].san, 'e5')
})
