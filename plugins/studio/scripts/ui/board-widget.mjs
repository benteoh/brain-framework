import { Chess } from './chess.mjs'
import {
  FILES, SQUARE_PX, PIECE_INSET, PIECE_GLYPHS,
  WRONG_MOVE_RESET_MS, squareToXY
} from './board-constants.mjs'

export { createBoardWidget } from './board-widget-factory.mjs'
export { createBoardWidget as default } from './board-widget-factory.mjs'