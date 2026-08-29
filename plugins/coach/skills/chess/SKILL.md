---
name: chess
description: Analyse chess evidence and run adaptive, agent-directed coaching using deterministic chess tools when available.
---

# Chess Coach

Use this skill for game analysis, opening study, tactical training, decision review, or continued chess learning.

Defer to the core `learn` skill for the session contract and for chapter mode. This skill only adds what's chess-specific.

Read [references/evidence.md](references/evidence.md) before making any claim from engine or game data.

## Chess-specific delta

- Obtain the relevant PGN, FEN, move sequence, or position, and validate chess state with a rules library rather than reconstructing it by hand.
- Separate deterministic facts, engine judgements, and pedagogical hypotheses per `references/evidence.md`. Do not present an engine score as an explanation of the learner's thinking.
- Teach from the learner's own games. A chapter about a weakness they demonstrated beats a chapter about whatever comes next in a canonical syllabus.

## Tooling

One-time, per machine:

```bash
node plugins/coach/skills/chess/scripts/setup-engine.mjs
```

Installs Stockfish and `chess.js` into `.brain/vendor/` (machine-local, gitignored, outside the `sync`-managed file set). Everything below degrades to unaided judgement if this has not been run — say so plainly rather than guessing evals.

```bash
node plugins/coach/skills/chess/scripts/chesscom.mjs --user <handle> --last 30
node plugins/coach/skills/chess/scripts/analyse.mjs --limit 30
```

`chesscom.mjs` writes `Learning/Chess/Games/<id>.pgn` plus `index.json` — pure retrieval, no judgement. `analyse.mjs` writes `Learning/Chess/Evidence/<id>.json` per game plus `summary.json` across all of them: per-ply eval, best move, centipawn loss, accuracy, phase, deterministic tags, and MultiPV alternatives on the learner's mistakes and blunders. Budget roughly a minute per game.

Read `summary.json` first. It is the fastest route from "I don't know this learner" to "I know what they actually get wrong".

## Session arc

1. **Profile.** If `Learning/Chess/Profile.md` doesn't exist, building it is the first activity — derived from games, not from an interview. Ask for the Chess.com handle, import, analyse, and let the evidence establish level and weaknesses. Ask only what evidence cannot answer: goals, time available, what they enjoy, what they have already studied.
2. **Diagnose.** From `summary.json` plus prior session notes, pick the one thing most worth fixing. Prefer a pattern recurring across games over a single spectacular blunder.
3. **Author a chapter** per the core `learn` skill's chapter mode, using `chapter-shell`. Ground it in their positions.
4. **Debrief** from the emitted chapter events, not by asking how it went. Open by testing a sample of earlier notes before adding new ones, and write the session's notes in whichever mode `Profile.md` records — challenging vague direction and leaving a review cue, per the core `learn` skill's note-authorship rules.

Engine evidence makes the "challenge vagueness" obligation unusually cheap here, and it should be used: when a learner claims they understand why a move lost, the evidence file already holds what the position was actually worth and what the alternatives were. Check the claim against it rather than accepting a plausible-sounding account.

## Authoring a chess chapter

Shape, not curriculum — judgement about what this learner needs is the point of the coach.

- Show the mistake before the theory. Several instances of the same error from their own games, then the principle that explains all of them, then a position where they apply it.
- Use `compare` blocks for what they played against what the engine wanted. Use `game` blocks with the eval graph when the story is about how a game turned, not a single move.
- In `exercise` blocks, pre-author feedback for the wrong answers you actually expect. The deep-pass `alternatives` in the evidence file tell you what the plausible tries were and what each is worth, so this is grounded rather than guessed.
- State the provenance block honestly: engine, depth, which games, when.

Live play against a position remains available — see [references/board-session-contract.md](references/board-session-contract.md) — and is the right choice for a genuinely interactive drill. It is no longer the default for a teaching session.

Without a compatible Studio renderer, fall back to SAN, FEN, compact diagrams, and Markdown via `render-chapter-md.mjs`. The pedagogical result must not depend on the renderer.
