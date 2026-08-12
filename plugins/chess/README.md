# Chess plugin

Chess adds domain evidence and coaching guidance while leaving each learning session under agent control. The agent may analyse a game, teach an opening, test calculation, compare candidate moves, or create a different exercise from the learner's needs.

## Minimal implementation direction

Keep bespoke code at integration boundaries:

- use `chess.js` (or an equivalent replaceable rules adapter) for PGN/FEN parsing, legal moves, and board state;
- use a UCI Stockfish package or external engine adapter for deterministic evaluation;
- use Chess.com's public data interfaces only for authorised game retrieval;
- use Studio capabilities when installed for a board, arrows, highlighted squares, and interaction;
- fall back to PGN, FEN, diagrams, and Markdown when Studio is absent.

Do not implement chess rules, SAN parsing, or an engine in the plugin. Keep provider retrieval, rules, evaluation, pedagogy, and presentation behind separate interfaces so a dependency or platform can be replaced.

This bootstrap ships the skill and capability contract, not the runtime adapters.
