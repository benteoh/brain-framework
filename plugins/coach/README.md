# Coach plugin

Coach holds two sibling coaching subskills side by side — `coach:chess` and `coach:language` —
so both domains share one plugin instead of each restating the generic learning loop. The loop
itself (establish goal, let the learner work first, diagnose, adapt, offer to save) belongs to
the core `learn` skill; each subskill here documents only its own domain-specific delta and
defers to `learn` for everything else.

- `skills/chess/` — game analysis, opening study, tactical training, decision review. Reads
  `references/evidence.md` before making any claim from engine or game data, and separates
  deterministic facts, engine judgements, and pedagogical hypotheses.
- `skills/language/` — vocabulary, grammar, and comprehension practice in any target language.
  Target language, level, and goal are always resolved as session parameters, never hardcoded.
  Composes exercises per `references/exercise-surface-contract.md` and instantiates progress per
  `references/skill-tree-scaffold.md`. There is no engine oracle for language, unlike chess —
  correctness is the agent's own linguistic judgment, and it is labeled as such.

## Data convention

`dataRoot` is `Learning`, broadened from chess's old `Learning/Chess`, and is intentionally
broad: it spans both domains rather than one dedicated root per subskill. Chess data nests at
`Learning/Chess/`; language data nests at `Learning/<Language>/` (one folder per language,
created the first time a learner studies it — never pre-populated in this repo). The plugin
manager only tracks the single `Learning` root; it does not itself enumerate or validate either
subfolder's contents or shape.

## Enable-together tradeoff

The plugin manifest schema has no per-subskill enable/disable mechanism. Enabling `coach`
installs `coach:chess` and `coach:language` together — an instance cannot install only one of
the two.

This remains acceptable because the heavy dependency chess now has is *not* installed with the
plugin. `skills/chess/scripts/setup-engine.mjs` is an explicit, opt-in, one-time command that
installs Stockfish and `chess.js` into the instance's `.brain/vendor/`. A learner who only uses
`coach:language` never runs it and pays nothing.

## Chess pipeline

Implemented, in `skills/chess/scripts/`:

- `setup-engine.mjs` — installs Stockfish (`stockfish` npm, WASM) and `chess.js` into
  `.brain/vendor/`, prunes the full-net builds, and verifies with a real search.
- `lib/engine.mjs` — UCI adapter. Owns the eval-convention normalisation (UCI reports
  side-to-move-relative scores; everything above this layer sees white-relative) and serialises
  searches so callers never manage engine state.
- `chesscom.mjs` — retrieval only, from Chess.com's public API. No auth, no judgement.
- `analyse.mjs` — two-pass engine analysis producing per-ply evidence plus aggregates.

Stockfish is installed rather than vendored deliberately: it is GPL-3.0 and this repo is not, and
the published package is 240 MB before pruning. The boundaries the original direction called for
still hold — retrieval, rules, evaluation, pedagogy, and presentation stay behind separate
interfaces, and no chess rules, SAN parsing, or engine logic is implemented here.

Everything degrades to unaided judgement when the engine is not installed. That degradation must
be stated to the learner, not silently papered over with a guess.

## Minimal implementation direction (language)

No new infrastructure beyond what already exists: the agent composes each session's exercise
surface by hand per `references/exercise-surface-contract.md`, using the `Artifact` tool for
rendering. The reusable shell-template platform (canonical HTML shells checked into a `studio`
templates directory) is deferred until this v0 turn-based UX is validated — see the language
subskill's references for the current, prose-only contract.
