# Board session contract

The agent composes only a small declarative data payload and a starting position per session; a
fixed, checked-in `studio` shell template (`plugins/studio/templates/board-shell.html`) renders
the board and the conversation. Nothing here hand-composes HTML — see the `studio` skill
(`plugins/studio/skills/studio/SKILL.md`) for the full shell inventory and the
`/data`/`/state`/`/update` contract this depends on.

Scope: this covers an interactive session where the learner explores or plays moves against a
given position and the agent gives feedback — `board-shell` plus `chess.js` for legal-move UX
only. It does not cover PGN/Chess.com import, Stockfish or any engine analysis, a persistent
`Games/`/`Evidence` data pipeline, or opening theory content; those remain out of scope for this
skill (see the scope boundary this doc's design spec calls out) and are not implemented here.

## Data and state shapes

- `/data` (static per-session content, written once as a JSON file): `{title, context, prompt,
  orientation: 'white'|'black'}`. `orientation` picks which side sits at the bottom of the
  rendered board.
- `/state` (the live position): `{fen}`. The shell reads `/state` once on load for the starting
  position, then applies any subsequent `{kind: 'state', data: {fen}}` event pushed over
  `/events` as the authoritative position, discarding whatever the learner had selected locally.

## Interaction loop

1. Write the session's data payload as a small JSON file matching the shape above: a `title`, a
   `context` paragraph (what position this is and why), a `prompt` (what the learner is being
   asked to do — "find the best move for White", "play through this position and see what
   happens"), and `orientation`.
2. Start `plugins/studio/scripts/serve.mjs --html plugins/studio/templates/board-shell.html --data <data-path> --out <transcript-path>`, then push the starting position with
   `plugins/studio/scripts/update.mjs --data '{"fen":"<FEN>"}'` (the shell's `GET /state` starts
   `{}` until the first push, so send the opening FEN before or right after opening the page —
   the shell also loads whatever `/state` already holds on first page load, so either ordering
   works). Open the served `http://127.0.0.1:<port>/` URL with `open.mjs`. Do not hand-compose
   HTML.
3. The learner plays moves directly on the board: click a piece, then click one of the legal
   destination squares the shell highlights (computed client-side by the vendored `chess.js`;
   illegal destinations are never offered, so an illegal move never reaches the server). A
   promotion prompts a piece picker before the move completes. On a legal move, the shell
   optimistically re-renders its own local position and `POST`s the resulting SAN string to
   `/submit` — **exactly like any other chat message**, tagged `role: "learner"`. There is no
   separate "moves" channel: read the transcript for new `learner`-role entries the same way a
   quiz/lesson session reads them for prose answers, and treat each one as a move attempt to
   evaluate rather than a stray remark. Confirm from `serve.mjs`'s actual behavior (`POST
   /submit` records `{role: "learner", text, at}` unconditionally) before assuming any other
   shape.
4. Evaluate the move against the position and the stated prompt using chess judgement — validate
   it against the position with a rules library rather than reconstructing legality by hand (per
   `references/evidence.md`), then form a pedagogical read of whether it serves the prompt (best
   move found, reasonable try, missed a tactic, and so on). **There is no engine here.** No
   Stockfish or other engine is wired into this loop — chess.js supplies legality only. Any claim
   that a move is "good," "best," or "a mistake" is the agent's own chess judgement, not a
   deterministic score, and should be presented that way: the move itself (SAN, and the resulting
   FEN) is the deterministic fact; whether it's good is a judgement; any claim about why the
   learner played it is a pedagogical hypothesis. Keep those three separate per
   `references/evidence.md`.
5. Reply with `plugins/studio/scripts/say.mjs --text "..."` for commentary — this appears live in
   the conversation panel next to the board, not as a change to the position. Then push the next
   authoritative position with `plugins/studio/scripts/update.mjs --data '{"fen":"<FEN>"}'`:
   either the same FEN restated (confirming the learner's move stands) or a corrected FEN (if the
   agent is stepping the learner back, offering a different position to try, or advancing to the
   next stage of a multi-position exercise). The shell merges the new FEN as the authoritative
   position on the next `{kind:'state'}` event, discarding any local selection in progress.
6. At session end, distil durable outcomes per the core `learn` skill's durable structure (a
   `Sessions/<date> <topic>.md` note plus the subject map's Subjects table); then stop the
   server. There is no bespoke `Games/`/`Evidence` file to write here — that pipeline is
   out of scope for this skill (see the scope note above).

## Mapping common exercise shapes onto the loop

- **"Guess the best move"**: `prompt` states the ask directly (e.g. "Find White's best move.").
  Push the position once via `update.mjs`, then wait for the first learner-role transcript entry.
  Evaluate it as a one-shot attempt: confirm the position either way with another `update.mjs`
  push (restate the FEN if it was right, or the position after the actual best move if not), and
  use `say.mjs` to explain why.
- **"Explore this position"**: `prompt` invites free play (e.g. "See what happens after each
  side's best try."). Treat every learner-role entry as one ply of an ongoing line: after each
  move, decide whether to let it stand (push the resulting FEN, unchanged) or reply with a
  candidate response move for the other side (make that move against chess.js locally, push the
  resulting FEN, and narrate it with `say.mjs`) before waiting for the learner's next move.

## What "legal-move UX only" means in practice

Client-side legality is the only automated check in this loop. It rules out illegal moves as
*inputs* — it says nothing about whether a legal move is a *good* one. Do not let the shell's
legal-move-only UX read as if the board is scoring the learner; every quality judgement still
comes from the agent's own chess reasoning, stated as such.
