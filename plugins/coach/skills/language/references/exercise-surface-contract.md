# Exercise surface contract

The agent composes only a small declarative data payload per session; a fixed, checked-in
`studio` shell template (`plugins/studio/templates/`) renders it. Nothing here hand-composes
HTML — see the `studio` skill (`plugins/studio/skills/studio/SKILL.md`) for the full shell
inventory and the `/data`/`/state`/`/update` contract this depends on. This supersedes the
earlier (v0) plan of hand-composing self-contained HTML per session.

## Two modes, one shape

Both modes render through the same two shells:

- **Lesson mode** (interactive textbook): one section shown at a time in a centered carousel card
  (prev/next, dots), with an inline answer field under its exercise prompt if any — hints allowed,
  no score recorded. Use `plugins/studio/templates/lesson-shell.html`, data
  `{title, sections: [{heading, body, exercisePrompt?}], currentIndex?, completed?: number[],
  feedback?: {index, correct, note?}}`. `body`/`exercisePrompt` support minimal inline markdown
  (`**bold**`, `_italic_`) — no other markup is parsed. When the learner's answer to the current
  section is correct, push all three of `completed` (append the current index), `feedback`
  (`{index: currentIndex, correct: true, note}`), and `currentIndex + 1` via `update.mjs` in one
  call — this gives an inline checkmark on the card, a checkmark dot in the nav rail, and advances
  the carousel, instead of leaving the learner to notice a chat reply and click next themselves. On
  an incorrect answer, give feedback in chat only and leave `currentIndex`/`completed` untouched so
  the learner retries the same card.
- **Test mode**: prompt to response to feedback, no hints, scored, one evidence record per
  attempt — use `plugins/studio/templates/quiz-shell.html`, data
  `{title, context, prompt, hints: string[]}`. Hints written into the data payload render as
  clickable chips the learner can choose to reveal.

## Interaction loop

1. Write the session's data payload as a small JSON file matching the chosen shell's shape
   above.
2. Start `plugins/studio/scripts/serve.mjs --html plugins/studio/templates/<quiz-shell|lesson-shell>.html --data <data-path> --out <transcript-path>` and open the served
   `http://127.0.0.1:<port>/` URL with `open.mjs`. Do not hand-compose HTML — pick whichever of
   the two shells matches the current mode.
3. Learner works the exercise and replies from inside the page itself — no chat needed for the
   substance.
4. Agent watches the transcript file for new learner messages and replies with
   `plugins/studio/scripts/say.mjs`, which appears live on the page over SSE, rather than
   waiting for the learner to transcribe results in chat.
5. To move to the next prompt within the same session without a full page reload, either
   rewrite the data file (`quiz-shell`/`lesson-shell` re-read `GET /data` on the next load) or
   push the new prompt/section live with `plugins/studio/scripts/update.mjs` — both shells merge
   a pushed state update into the current view and re-render.
6. At session end, agent distills the session per the core `learn` skill's durable structure (a
   `Sessions/<date> <topic>.md` note plus the subject map's Subjects table) and `Vocabulary.md`;
   then stops the server.

## Correctness has no oracle here

Unlike chess, there is no engine to check an answer against. Every correctness call in test mode
is the agent's own linguistic judgment. Label it as such in the evidence record — keep the
learner's verbatim response as the deterministic fact, and the agent's assessment (plus its
stated reasoning when it's a judgment call rather than an exact match) as a separate, clearly
labeled field.
