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

## Interaction loop

1. Agent composes the HTML for the current prompt/exercise, including a conversation panel
   (hydrates from `GET /transcript`, appends messages received over `EventSource('/events')`,
   and a `POST /submit` input) — see the `studio` skill for the exact contract.
2. Agent starts `plugins/studio/scripts/serve.mjs` for that file and opens the served
   `http://127.0.0.1:<port>/` URL with `open.mjs`.
3. Learner works the exercise and replies from inside the page itself — no chat needed for the
   substance.
4. Agent watches the transcript file for new learner messages and replies with
   `plugins/studio/scripts/say.mjs`, which appears live on the page over SSE, rather than
   waiting for the learner to transcribe results in chat.
5. At session end, agent distills the session per the core `learn` skill's durable structure (a
   `Sessions/<date> <topic>.md` note plus the subject map's Subjects table) and `Vocabulary.md`;
   then stops the server.

## Correctness has no oracle here

Unlike chess, there is no engine to check an answer against. Every correctness call in test mode
is the agent's own linguistic judgment. Label it as such in the evidence record — keep the
learner's verbatim response as the deterministic fact, and the agent's assessment (plus its
stated reasoning when it's a judgment call rather than an exact match) as a separate, clearly
labeled field.

## Still deferred: v2 reusable shell templates

The interaction loop above is real and live; what's still hand-composed per session is the HTML
itself. See `docs/superpowers/specs/2026-08-15-studio-language-coach-design.md` in the private
vault, "Deferred: v2 reusable shell templates," for the plan to replace that with a fixed
template plus a small declarative data payload.
