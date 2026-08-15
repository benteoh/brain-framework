# Exercise surface contract (v0)

This is a prose contract the agent follows when composing each session's exercise surface by
hand. It is not a saved template — the reusable shell-template platform (`quiz-shell`,
`lesson-shell`, `board-shell`, `progress-shell` under a future `studio` templates directory) is
a deferred v2. When that platform ships, this file is superseded; until then, the agent
hand-composes self-contained HTML per session following the shape below.

## Two modes, one shape

Both modes share the same HTML shell: a prompt area, a response input (free text or multiple
choice for language; a clickable board for chess is a separate, later concern), and a feedback
area. Self-contained — no CDN scripts, inline any needed CSS/JS.

- **Lesson mode** (interactive textbook): explanation blocks interleaved with inline exercises.
  Hints allowed. No score recorded — this is teaching, not assessment.
- **Test mode**: prompt to response to feedback. No hints. Scored. Writes one evidence record
  per attempt.

## Interaction loop (v0)

1. Agent composes the HTML for the current prompt/exercise and publishes it via `Artifact`.
2. Learner works it in the browser.
3. Learner reports the result in chat (what they answered, what they picked). Turn-based, no
   extra plumbing.
4. Agent gives feedback and revises the same artifact in place for the next prompt, rather than
   publishing a new page per turn.
5. At session end, agent distills the session to Markdown: vocabulary entries, evidence records,
   progress updates.

## Correctness has no oracle here

Unlike chess, there is no engine to check an answer against. Every correctness call in test mode
is the agent's own linguistic judgment. Label it as such in the evidence record — keep the
learner's verbatim response as the deterministic fact, and the agent's assessment (plus its
stated reasoning when it's a judgment call rather than an exact match) as a separate, clearly
labeled field.

## Upgrade path (deferred)

v1, only once v0's UX is validated: use the `artifact-capabilities` live-state runtime so the
artifact records answers itself and the agent reads them back next turn instead of the learner
transcribing results in chat. This requires loading the `artifact-capabilities` skill and
declaring capabilities before publishing — deliberately out of scope until the exercise format
above is validated in real sessions.
