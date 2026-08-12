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

This bootstrap defines the capability contract only; it does not yet ship a renderer runtime.
