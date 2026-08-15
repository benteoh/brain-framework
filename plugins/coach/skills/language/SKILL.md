---
name: language
description: Run adaptive, agent-directed language-learning sessions (lesson or test mode) for any target language, level, and goal.
---

# Language Coach

Use this skill for vocabulary practice, grammar drills, comprehension exercises, or continued language learning in any target language.

Defer to the core `learn` skill for the session contract (establish goal, let the learner work first, diagnose, adapt, offer to save). This skill only adds what's language-specific. Nothing in this skill or its references hardcodes a particular language — target language, level, and goal are always resolved at session start.

## Language-specific delta

- Establish the target language, level, and goal as session parameters: read `Learning/<Language>/Current Focus.md` if it exists, otherwise ask the learner directly. Do not assume a language or level from context.
- Choose lesson mode (interactive textbook: explanation plus inline exercises, hints allowed, unscored) or test mode (prompt/response/feedback, no hints, scored, one evidence record per attempt) based on the learner's stated goal.
- Compose the exercise surface per [references/exercise-surface-contract.md](references/exercise-surface-contract.md). Publish via `Artifact` and redeploy the same artifact in place for each turn rather than publishing a new page per prompt.
- There is no engine oracle for language the way there is for chess. Every "correct" or "incorrect" judgment is the agent's own linguistic judgment, not a deterministic check — say so explicitly when recording it, and keep the learner's verbatim response alongside that judgment as the deterministic part of the record.
- Instantiate skill-tree progress per [references/skill-tree-scaffold.md](references/skill-tree-scaffold.md): the node shape is generic and framework-owned; a node's actual grammar/vocab content is generated the first time it becomes the learner's active focus, never shipped as static per-language data.
- Ask before persisting. When the learner agrees, distil the session into `Learning/<Language>/Sessions/<date>.md` (distilled notes, not a transcript), update `Vocabulary.md` (word, translation, example, first-seen, last-seen, confidence label) and `Progress.md` (node, mastery %, last practiced, evidence links), and update `Current Focus.md` if the active node changed.
- Defer vocabulary resurfacing timing to the existing `review-learning` skill; do not implement a bespoke spaced-repetition or scheduling formula here.
