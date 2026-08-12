# Chess evidence standard

Classify claims before teaching from them.

## Deterministic facts

Examples: legal moves, check status, repetition, material count, parsed clock data, and the recorded move sequence. Prefer a rules or PGN library over manual reconstruction.

## Engine judgements

Record the engine, settings, side to move, evaluation convention, and principal variation when they matter. Treat shallow evaluations and large horizon-dependent swings cautiously. An engine score is evidence about the position, not an explanation of the learner's thinking.

## Pedagogical hypotheses

Examples: missed threat, weak candidate generation, rushed time use, unfamiliar structure, or calculation failure. Ground these in the game and the learner's reconstruction. State uncertainty and test the diagnosis with a related position or question.

Do not infer a stable weakness from one move. Prefer recurring patterns across games or a direct transfer test.
