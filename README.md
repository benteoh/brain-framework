# Brain

Brain is a local-first, agent-agnostic learning system that helps you get better from what you actually do.

It stores durable knowledge as ordinary files, gives agents portable learning skills, and supports optional plugins for domain tools and richer interfaces. It is designed to work with any capable filesystem agent and remain useful in Obsidian or a text editor.

## Principles

- Evidence of performance matters more than accumulated information.
- The agent directs each learning session; plugins supply capabilities, not fixed curricula.
- Personal knowledge is user-owned and never silently overwritten by framework updates.
- Markdown is the portable baseline. Interactive artifacts progressively enhance it.
- Core stays small; domain behaviour and presentation belong in optional plugins.

## Repository

```text
brain-framework/
├── README.md
├── AGENTS.md
├── Brain.md
├── skills/
└── plugins/
```

## Use from a clone

Requires Node.js 22 or newer.

```bash
node skills/brain/scripts/brain.mjs validate
node skills/brain/scripts/brain.mjs init --target /path/to/my-brain
node skills/brain/scripts/brain.mjs plugin add studio --target /path/to/my-brain
node skills/brain/scripts/brain.mjs status --target /path/to/my-brain
node skills/brain/scripts/brain.mjs update --target /path/to/my-brain
```

`init` seeds a new Brain or safely adds portable skills to an existing vault. Existing `Brain.md` and unrelated files are preserved. Updates replace only managed files that have not been locally modified.

## Plugins

- `studio`: optional local rendering, interaction, annotation, and artifact persistence.
- `chess`: Chess.com and engine evidence guidance for agent-directed chess learning.

Plugins must retain useful fallbacks when optional capabilities are absent. Chess works through Markdown without Studio; Studio has no knowledge of chess pedagogy.

## Status

This repository is an early framework bootstrap. The file and plugin contracts may evolve before the first tagged release.
