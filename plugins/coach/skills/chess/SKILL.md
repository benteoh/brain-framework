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
- With compatible Studio capabilities, the agent may compose a board with arrows, highlights, variation controls, prompts, and chat. Without them, use SAN, FEN, compact diagrams, and Markdown. The pedagogical result must not depend on the renderer.
