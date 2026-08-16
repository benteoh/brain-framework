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
the two. This is an accepted v0 tradeoff, not a bug: it's fine while both subskills stay
markdown-only, and would only need revisiting if a subskill later grows a heavy runtime
dependency (chess's eventual Stockfish/`chess.js` wiring, for example) that an instance wanting
only the other subskill shouldn't have to install.

## Minimal implementation direction (chess)

Keep bespoke code at integration boundaries:

- use `chess.js` (or an equivalent replaceable rules adapter) for PGN/FEN parsing, legal moves,
  and board state;
- use a UCI Stockfish package or external engine adapter for deterministic evaluation;
- use Chess.com's public data interfaces only for authorised game retrieval;
- use Studio capabilities when installed for a board, arrows, highlighted squares, and
  interaction;
- fall back to PGN, FEN, diagrams, and Markdown when Studio is absent.

Do not implement chess rules, SAN parsing, or an engine in the plugin. Keep provider retrieval,
rules, evaluation, pedagogy, and presentation behind separate interfaces so a dependency or
platform can be replaced. This plugin ships the skill and capability contract, not the runtime
adapters — the ingestion/analysis pipeline (`chess.js`/Stockfish wiring, PGN import) is a
separate, later piece of work.

## Minimal implementation direction (language)

No new infrastructure beyond what already exists: the agent composes each session's exercise
surface by hand per `references/exercise-surface-contract.md`, using the `Artifact` tool for
rendering. The reusable shell-template platform (canonical HTML shells checked into a `studio`
templates directory) is deferred until this v0 turn-based UX is validated — see the language
subskill's references for the current, prose-only contract.
