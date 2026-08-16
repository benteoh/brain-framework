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

`skills/studio/SKILL.md` documents Studio's first renderer: `scripts/open.mjs`, `scripts/serve.mjs`, and `scripts/say.mjs` — a local-only, dependency-free HTTP server and browser launcher. It renders one HTML artifact, carries a live conversation over Server-Sent Events, and never leaves the machine. Other adapters (a webview, an editor extension, an MCP-compatible app surface) can implement the same capability contract without being required by it.
