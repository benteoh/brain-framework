# Studio Component Library

Prop schemas and usage for each component. The AI agent composing chapters should reference this file to understand what data each component accepts.

## Status: not yet on the delivery path

These modules are the extracted, reviewable source for the behaviour currently
duplicated inline inside `templates/chapter-shell.html` and
`templates/board-shell.html`. Nothing shipped imports them yet. They are
exercised by `templates/sandbox.html` and `templates/gallery-shell.html`, which
are served over HTTP (`node scripts/dev-server.mjs`), and by
`tests/chess-module.test.mjs`.

They cannot be imported by a shipped shell as-is, because `SKILL.md` requires
every shell in `templates/` to be **fully self-contained** — inline CSS and JS,
no CDN, openable from a bare file path. A shell built from this library
therefore needs a build step that inlines `tokens.css` as a `<style>` block and
bundles the module graph reachable from the page's `<script type="module">`
into one classic script.

Whoever writes that step owes three things the current prototype does not
deliver:

1. **Fail loudly.** It must error if the inline-script or stylesheet marker it
   expects is absent, rather than writing out an unchanged copy and reporting
   success.
2. **Be verified.** A test should assert the output contains no `import`
   statement and no `../scripts/` reference, and that it differs from its input.
3. **Declare its dependency.** Studio advertises itself as a dependency-free
   local renderer; a bundler is a build-time dependency and needs declaring
   somewhere real, or hand-rolling against this module graph (plain ESM, static
   relative imports, no npm packages) so the claim stays true.

Until then, treat a change here as a change to *documentation and future
source*: it does not alter what a learner sees. Edits to shipped behaviour
still go in the shell templates, and must be mirrored here.

## Board Widget

```js
import { createBoardWidget } from './board-widget-factory.mjs'

const widget = createBoardWidget({
  fen: string,              // Required. FEN string for the position.
  orientation: 'white' | 'black',  // Optional, default 'white'. Which side is at the bottom.
  interactive: boolean,     // Optional, default false. If true, user can click to move pieces.
  arrows: Array<{ from: string, to: string, color?: string }>,  // Optional. Static arrows to draw.
  highlights: string[],     // Optional. Array of square names to highlight (e.g. ['e4', 'd5']).
  lastMove: { from: string, to: string } | null,  // Optional. Highlight the last move.
  ariaPrefix: string,       // Optional, default 'Chess board'. Prefix for aria-label.
  onMove: (result, chess) => void,  // Optional. Callback when a move is made (interactive only).
  onSelectionChange: (square, moves) => void,  // Optional. Callback when selection changes.
})
```

**API methods:**
- `widget.setFen(fen)` — Load a new position.
- `widget.getFen()` — Get current FEN.
- `widget.getChess()` — Get the underlying Chess instance.
- `widget.setArrows(arrows)` — Update arrows.
- `widget.setEngineArrow({ from, to })` — Set the engine's best move arrow.
- `widget.setHighlights(squares)` — Update highlighted squares.
- `widget.setLastMove(from, to)` — Highlight the last move.
- `widget.setInteractive(val)` — Toggle interactivity.
- `widget.setVerdict(square, kind)` — Show a verdict marker ('right' or 'wrong').
- `widget.clearSelection()` — Clear piece selection.
- `widget.render()` — Force re-render.

**DOM elements:**
- `widget.el` — The container div.
- `widget.svg` — The SVG board element.
- `widget.statusEl` — The status text element (aria-live).
- `widget.promoPicker` — The promotion picker element.

---

## Eval Bar

```js
import { createEvalBar } from './eval-bar.mjs'

const bar = createEvalBar()

bar.update({
  cpWhite: number | null,    // Centipawns from white's perspective.
  mateWhite: number | null,  // Mate score from white's perspective (positive = white mates).
  depth: number,             // Search depth.
  thinking: boolean,         // Whether the engine is currently analyzing.
})
```

**DOM elements:**
- `bar.el` — The container div.

---

## Top Lines Panel

```js
import { createTopLinesPanel } from './eval-bar.mjs'

const panel = createTopLinesPanel()

panel.update(fen, [
  { cpWhite: number, mateWhite: number | null, pv: string[], depth: number },
  // ... more lines
])
```

**DOM elements:**
- `panel.el` — The details element.

---

## Live Analysis

```js
import { attachLiveAnalysis } from './live-analysis.mjs'

const ctl = attachLiveAnalysis(widget, {
  depth: number,          // Optional, default 18.
  multipv: number,        // Optional, default 3.
  showBestArrow: boolean, // Optional, default true.
  startHidden: boolean,   // Optional, default false. If true, eval UI starts hidden.
})
```

**API methods:**
- `ctl.setHidden(val)` — Show/hide the eval UI.
- `ctl.refresh()` — Re-request analysis for the current position.
- `ctl.runOnce(fen, opts)` — One-shot analysis, returns a promise.
- `ctl.destroy()` — Clean up event listeners.

**DOM elements:**
- `ctl.evalBarEl` — The eval bar element.
- `ctl.topLinesEl` — The top lines panel element.

---

## Exercise Block

```js
import { createExerciseBlock } from './exercise-block.mjs'

const block = createExerciseBlock(
  {
    type: 'exercise',
    fen: string,                    // Required. Position FEN.
    orientation: 'white' | 'black', // Optional, default 'white'.
    mode: 'move' | 'text' | 'choice',  // Required. Input mode.
    question: string,               // Required. Markdown question text.
    options: string[],              // For mode='choice'. Array of option texts.
    answers: Array<{                // Required. Expected answers.
      move?: string,                // For mode='move'. SAN move.
      text?: string,                // For mode='text'. Expected text.
      option?: string,              // For mode='choice'. Option index.
      correct: boolean,             // Whether this is the correct answer.
      feedback: string,             // Markdown feedback text.
    }>,
    hints: string[],                // Optional. Array of hint texts (progressive disclosure).
    explanation: string,            // Optional. Markdown explanation shown after answer.
    engineLine: string,             // Optional. Engine's best line (for fallback).
  },
  ctx,                              // { sectionId, sectionHeading, blockIndex }
  emitEvent,                        // (event, sectionId, blockIndex, payload) => void
  markSectionProgress,              // (sectionId, state) => void
)
```

---

## Game Viewer

```js
import { createGameViewer } from './game-viewer.mjs'

const viewer = createGameViewer(
  {
    type: 'game',
    pgn: string,                    // Required. PGN text.
    orientation: 'white' | 'black', // Optional, default 'white'.
    headers: { White?: string, Black?: string, Result?: string },  // Optional.
    evalGraph: Array<{              // Optional. Per-ply evaluation data.
      ply: number,
      cp: number,
      mate: number | null,
      classification: 'best' | 'ok' | 'inaccuracy' | 'mistake' | 'blunder',
    }>,
    annotations: { [ply: string]: string },  // Optional. Per-ply markdown annotations.
  },
  ctx,                              // { sectionId, sectionHeading, blockIndex }
  emitEvent,                        // (event, sectionId, blockIndex, payload) => void
)
```

---

## Compare Block

```js
import { createCompareBlock } from './compare-block.mjs'

const block = createCompareBlock(
  {
    type: 'compare',
    orientation: 'white' | 'black',  // Optional, default 'white'.
    left: {
      fen: string,                   // Required.
      label: string,                 // Optional.
      caption: string,               // Optional.
      evalCp: number,                // Optional. If omitted, engine analyzes live.
    },
    right: {
      fen: string,
      label: string,
      caption: string,
      evalCp: number,
    },
    note: string,                    // Optional. Markdown note below the comparison.
  },
  ctx,                               // { sectionId, sectionHeading, blockIndex }
)
```

---

## Quiz Block

```js
import { createQuizBlock } from './quiz-block.mjs'

const block = createQuizBlock(
  {
    type: 'quiz',
    question: string,                // Required. Markdown question text.
    options: Array<{                 // Required. Array of options.
      text: string,                  // Markdown option text.
      correct: boolean,              // Whether this is correct.
      feedback: string,              // Markdown feedback shown on selection.
    }>,
  },
  ctx,                               // { sectionId, sectionHeading, blockIndex }
  emitEvent,                         // (event, sectionId, blockIndex, payload) => void
  markSectionProgress,               // (sectionId, state) => void
)
```

---

## Callout Block

```js
import { createCalloutBlock } from './callout-block.mjs'

const block = createCalloutBlock(
  {
    type: 'callout',
    variant: 'principle' | 'theory' | 'warning' | 'insight',  // Required.
    title: string,                   // Optional. Overrides default title.
    body: string,                    // Required. Markdown body text.
  },
  ctx,                               // { sectionId, sectionHeading, blockIndex }
)
```

---

## Prose Block

```js
import { createProseBlock } from './prose-block.mjs'

const block = createProseBlock(
  {
    type: 'prose',
    body: string,                    // Required. Markdown body text.
  },
  ctx,                               // { sectionId, sectionHeading, blockIndex }
)
```

---

## Recap Block

```js
import { createRecapBlock } from './recap-block.mjs'

const block = createRecapBlock(
  {
    type: 'recap',
    points: string[],                // Required. Array of markdown strings.
  },
  ctx,                               // { sectionId, sectionHeading, blockIndex }
)
```

---

## Board Block

```js
import { createBoardBlock } from './board-block.mjs'

const block = createBoardBlock(
  {
    type: 'board',
    fen: string,                     // Required. Position FEN.
    orientation: 'white' | 'black',  // Optional, default 'white'.
    interactive: boolean,            // Optional, default false.
    arrows: Array<{ from, to, color? }>,  // Optional.
    highlights: string[],            // Optional.
    analysis: 'off' | 'on',          // Optional, default 'on'. If 'off', no eval bar.
    caption: string,                 // Optional.
    line: {                          // Optional. A line of moves to step through.
      moves: string[],               // Array of SAN moves.
      startPly: number,              // Optional. Starting ply number for display.
    },
  },
  ctx,                               // { sectionId, sectionHeading, blockIndex }
  emitEvent,                         // (event, sectionId, blockIndex, payload) => void
)
```

---

## Shared Utilities

### Markdown Rendering

```js
import { renderMarkdownInto, setInlineMarkdown, escapeText } from './markdown.mjs'

renderMarkdownInto(el, markdownString)  // Renders full markdown (paragraphs, lists, etc.)
setInlineMarkdown(el, text)             // Renders inline markdown only (bold, italic, code, links)
escapeText(el, text)                    // Sets textContent safely
```

### Chess

```js
import { Chess } from './chess.mjs'

const chess = new Chess(fen)
chess.move(san, { sloppy: true })
chess.fen()
chess.in_check()
chess.in_checkmate()
// ... standard chess.js API
```

### PGN Parser

```js
import { parsePgn } from './pgn-parser.mjs'

const game = parsePgn(pgnString)
// Returns: { headers, moves, positions, startFen }
```

---

## Design Tokens

All components use CSS custom properties defined in `tokens.css`. Key tokens:

- `--color-bg`, `--color-surface`, `--color-fg`, `--color-fg-muted`
- `--color-accent`, `--color-accent-fg`
- `--color-verdict-right`, `--color-verdict-wrong`
- `--color-sq-light`, `--color-sq-dark`, `--color-sq-lastmove`, `--color-sq-check`
- `--space-1` through `--space-16` (4px base scale)
- `--radius-s`, `--radius-m`, `--radius-l`, `--radius-xl`, `--radius-pill`
- `--elevation-1`, `--elevation-2`, `--elevation-3`
- `--duration-fast`, `--duration-normal`, `--duration-slow`
- `--ease-out`, `--ease-in`, `--ease-in-out`, `--ease-spring`

See `tokens.css` for the full list.