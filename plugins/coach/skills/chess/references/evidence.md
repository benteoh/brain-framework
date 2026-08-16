# Chess evidence standard

Classify claims before teaching from them.

## Deterministic facts

Examples: legal moves, check status, repetition, material count, parsed clock data, and the recorded move sequence. Prefer a rules or PGN library over manual reconstruction.

## Engine judgements

Record the engine, settings, side to move, evaluation convention, and principal variation when they matter. Treat shallow evaluations and large horizon-dependent swings cautiously. An engine score is evidence about the position, not an explanation of the learner's thinking.

`scripts/analyse.mjs` writes all of this into every evidence file's `provenance` block, so cite the file rather than restating numbers from memory. Two properties of that pipeline are load-bearing when reading it:

- **Evaluations are white-relative centipawns**, while `cpLoss` is relative to whoever moved. UCI reports side-to-move-relative scores; mixing the two conventions is the standard way to produce confidently backwards analysis.
- **Depth varies by pass.** Every ply gets a bulk search; only the learner's mistakes and blunders get the deep MultiPV search that populates `alternatives`. A bulk-depth number and a deep-depth number are different strengths of claim and must not be quoted as if equivalent.

The `tags` on each ply (`played-capture`, `best-was-quiet`, `allowed-mate`, …) are deterministic facts about the move and the position. They are deliberately *not* motif names. "Missed a back-rank fork" is a pedagogical hypothesis and belongs in the next section.

When an evaluation is shown to the learner, its depth is shown with it. A depth-16 bulk eval and a depth-20 deep eval must never render identically.

## Pedagogical hypotheses

Examples: missed threat, weak candidate generation, rushed time use, unfamiliar structure, or calculation failure. Ground these in the game and the learner's reconstruction. State uncertainty and test the diagnosis with a related position or question.

Do not infer a stable weakness from one move. Prefer recurring patterns across games or a direct transfer test.

An aggregate is not a diagnosis either. `summary.json`'s `errorTags` counts what the moves *were*, not why they were played — `best-was-quiet` appearing across twenty blunders is a strong prompt to ask whether the learner only considers forcing moves, and is not itself the answer. Confirm it with a position the learner has not seen.
