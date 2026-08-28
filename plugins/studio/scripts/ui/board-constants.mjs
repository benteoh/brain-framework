export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
export const SQUARE_PX = 60
export const PIECE_INSET = 0.035
export const SHOW_COORDS = true
export const WRONG_MOVE_RESET_MS = 1100

export const PIECE_GLYPHS = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
}

export function squareToXY(square, orientation = 'white') {
  const fileIndex = FILES.indexOf(square[0])
  const rankIndex = Number(square[1])
  let col, row
  if (orientation === 'black') {
    col = 7 - fileIndex
    row = rankIndex - 1
  } else {
    col = fileIndex
    row = 8 - rankIndex
  }
  return { x: col * SQUARE_PX, y: row * SQUARE_PX }
}