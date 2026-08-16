---
name: language
description: Run adaptive, agent-directed language-learning sessions (lesson or test mode) for any target language, level, and goal.
---

# Language Coach

Use this skill for vocabulary practice, grammar drills, comprehension exercises, or continued language learning in any target language.

Defer to the core `learn` skill for the session contract (establish goal, let the learner work first, diagnose, adapt, offer to save). This skill only adds what's language-specific. Nothing in this skill or its references hardcodes a particular language — target language, level, and goal are always resolved at session start.

## Language-specific delta

- Establish the target language, level, and goal as session parameters: read `Learning/<Language>/<Language>.md` if it exists (the row(s) marked "In progress" in its Subjects table are the current focus), otherwise ask the learner directly. Do not assume a language or level from context.
- Choose lesson mode (interactive textbook: explanation plus inline exercises, hints allowed, unscored) or test mode (prompt/response/feedback, no hints, scored, one evidence record per attempt) based on the learner's stated goal.
- Render the exercise surface per [references/exercise-surface-contract.md](references/exercise-surface-contract.md): pick `quiz-shell` (test mode) or `lesson-shell` (lesson mode) from `studio`'s checked-in templates, write a small JSON data file, and start `studio`'s local runtime (`serve.mjs --data <path>`, `open.mjs`, `say.mjs`) rather than any cloud artifact tool or hand-composed HTML — the conversation happens live, in the page.
- There is no engine oracle for language the way there is for chess. Every "correct" or "incorrect" judgment is the agent's own linguistic judgment, not a deterministic check — say so explicitly when recording it, and keep the learner's verbatim response alongside that judgment as the deterministic part of the record.
- Instantiate skill-tree progress per [references/skill-tree-scaffold.md](references/skill-tree-scaffold.md): the node shape is generic and framework-owned; a node's actual grammar/vocab content is generated the first time it becomes the learner's active focus, never shipped as static per-language data.
- Ask before persisting. When the learner agrees, follow the core `learn` skill's durable structure: write `Learning/<Language>/Sessions/<date> <topic>.md` (subjects touched, focus, what was covered, key insights, subjects updated, open questions raised — not a transcript), and update `Learning/<Language>/<Language>.md`'s Subjects table directly (skill-tree stage, confidence 1-5, status) rather than a separate `Progress.md` or `Current Focus.md`. Also update `Vocabulary.md` (word, translation, example, first-seen, last-seen, confidence label) — the one language-specific addition with no generic equivalent.
- Defer vocabulary resurfacing timing to the existing `review-learning` skill; do not implement a bespoke spaced-repetition or scheduling formula here.
