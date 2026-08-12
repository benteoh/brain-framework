---
name: chess-coach
description: Analyse chess evidence and run adaptive, agent-directed coaching using deterministic chess tools when available.
---

# Chess Coach

Use this skill for game analysis, opening study, tactical training, decision review, or continued chess learning.

Read [references/evidence.md](references/evidence.md) before making claims from engine or game data.

## Session contract

1. Establish the learner's goal and obtain the relevant PGN, FEN, move sequence, or position.
2. Validate chess state with a rules library when available.
3. Select moments worth learning from; do not mechanically narrate every engine swing.
4. Ask the learner to reconstruct plans or candidate moves before revealing analysis when useful.
5. Separate deterministic facts, engine judgements, and pedagogical hypotheses.
6. Adapt the exercise to the response. The workflow is not a hardcoded lesson state machine.
7. Offer to save recurring decision patterns, demonstrated strengths, and a specific next practice.

With compatible Studio capabilities, the agent may compose a board with arrows, highlights, variation controls, prompts, and chat. Without them, use SAN, FEN, compact diagrams, and Markdown. The pedagogical result must not depend on the renderer.
