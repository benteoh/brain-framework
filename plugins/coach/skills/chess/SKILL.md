---
name: chess
description: Analyse chess evidence and run adaptive, agent-directed coaching using deterministic chess tools when available.
---

# Chess Coach

Use this skill for game analysis, opening study, tactical training, decision review, or continued chess learning.

Defer to the core `learn` skill for the session contract (establish goal, let the learner work first, diagnose, adapt, offer to save). This skill only adds what's chess-specific.

Read [references/evidence.md](references/evidence.md) before making any claim from engine or game data.

## Chess-specific delta

- Obtain the relevant PGN, FEN, move sequence, or position, and validate chess state with a rules library when available rather than reconstructing it by hand.
- Separate deterministic facts, engine judgements, and pedagogical hypotheses per `references/evidence.md`. Do not present an engine score as an explanation of the learner's thinking.
- Render an interactive session per [references/board-session-contract.md](references/board-session-contract.md): use `board-shell` from `studio`'s checked-in templates, write a small JSON data file plus the starting FEN, and start `studio`'s local runtime (`serve.mjs --data <path>`, `update.mjs`, `open.mjs`, `say.mjs`) rather than any cloud artifact tool or hand-composed HTML — the learner plays moves directly on the board and the agent replies live. Without a compatible Studio renderer, fall back to SAN, FEN, compact diagrams, and Markdown. The pedagogical result must not depend on the renderer.
