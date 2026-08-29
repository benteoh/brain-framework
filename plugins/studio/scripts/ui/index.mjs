// UI Component Library for Studio Shells
// Import individual components or use the default registry

export { createBoardWidget } from './board-widget-factory.mjs'
export { Chess } from './chess.mjs'
export * from './board-constants.mjs'
export * from './chess-utils.mjs'

export { createEvalBar, createTopLinesPanel, fmtScore, normalizeToWhite, uciPvToSan, uciToMoveParts } from './eval-bar.mjs'
export { clamp } from './eval-bar.mjs'
export { request, cancelPending, onAvailability, isAvailable, engineName, boot } from './engine-manager.mjs'

export { createProseBlock } from './prose-block.mjs'
export { createCalloutBlock } from './callout-block.mjs'
export { createBoardBlock } from './board-block.mjs'
export { createGameViewer } from './game-viewer.mjs'
export { createExerciseBlock } from './exercise-block.mjs'
export { createCompareBlock } from './compare-block.mjs'
export { createQuizBlock } from './quiz-block.mjs'
export { createRecapBlock } from './recap-block.mjs'

export { attachLiveAnalysis } from './live-analysis.mjs'
export { engineUnavailableNote } from './engine-fallback.mjs'
export { createAskAboutButton, createBlockWrapper } from './shared-utils.mjs'

export { parsePgn } from './pgn-parser.mjs'
export { renderMarkdown, renderMarkdownInto, setInlineMarkdown, escapeHtml, escapeText, details } from './markdown.mjs'

export { analyzeOnce } from './engine-fallback.mjs'
export { movesEquivalent, normalizeAnswerText } from './exercise-utils.mjs'

// Default block renderer registry for chapter shells
export const BLOCK_RENDERERS = {
  prose: createProseBlock,
  callout: createCalloutBlock,
  board: createBoardBlock,
  game: createGameViewer,
  exercise: createExerciseBlock,
  compare: createCompareBlock,
  quiz: createQuizBlock,
  recap: createRecapBlock,
}