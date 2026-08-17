# Studio plugin

Studio is an optional presentation surface for Brain. It lets an agent compose local pages from Markdown, MDX, HTML, and reusable UI elements; receive user interactions; attach annotations; and persist useful artifacts.

Studio is deliberately not the Brain runtime. Learning, knowledge, and plugin skills continue to work without it. It does not prescribe an agent, model provider, UI protocol, or learning workflow.

## Capability boundary

The agent chooses what to show and why. Studio supplies generic operations:

- render a document or local interactive artifact;
- identify addressable text or elements;
- show agent or learner annotations;
- return form and pointer events to the active agent;
- save the artifact and its state as user-owned files.

An implementation may use a webview, local web server, editor extension, MCP-compatible app surface, or another transport. Those are adapters, not canonical storage formats.

## Portable fallback

Every important conclusion, annotation, or learner-state change must be representable in ordinary files. Interactive UI state may enhance a note but must not become the only copy of durable knowledge.

## Local runtime

`skills/studio/SKILL.md` documents Studio's first renderer: `scripts/open.mjs`, `scripts/serve.mjs`, `scripts/say.mjs`, and `scripts/update.mjs` — a local-only, dependency-free HTTP server and browser launcher. It renders one HTML artifact, carries a live conversation and a live state channel over Server-Sent Events, and never leaves the machine. Other adapters (a webview, an editor extension, an MCP-compatible app surface) can implement the same capability contract without being required by it.

## Shell templates

`templates/chapter-shell.html`, `templates/quiz-shell.html`, `templates/lesson-shell.html`, `templates/board-shell.html`, and `templates/progress-shell.html` are checked-in, reusable rendering surfaces: an agent picks the shell matching its content shape, writes a small JSON data file, and starts `serve.mjs --html <shell> --data <path> --out <transcript-path>` — no per-session markup generation. Each shell fetches its content from `GET /data`, hydrates `GET /transcript`, and subscribes to `GET /events`, dispatching chat vs. state pushes by the event's `kind` field. See `skills/studio/SKILL.md` for the full per-shell data shapes and the `/data`/`/state`/`/update` contract; hand-composing HTML per session (the original v0/v1 mechanism) remains a documented fallback for content that doesn't fit an existing shell.

`chapter-shell` is the long-form surface and the default for a teaching session: a whole 15–60 minute lesson as one self-paced document, with feedback pre-authored into the payload so the learner never waits on an agent turn, and — given `--assets` pointing at an installed engine — live analysis on every board. `scripts/render-chapter-md.mjs` renders the same payload to Markdown, which is what keeps the portable-fallback rule above true for it.
