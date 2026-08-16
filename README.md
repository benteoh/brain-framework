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
├── brain-framework.json
├── skills/
└── plugins/
```

## Use from a clone

Requires Node.js 22 or newer.

```bash
git clone https://github.com/benteoh/brain-framework
node brain-framework/skills/brain/scripts/brain.mjs init --target /path/to/my-brain
node brain-framework/skills/brain/scripts/brain.mjs sync --target /path/to/my-brain
node brain-framework/skills/brain/scripts/brain.mjs update --to 0.1.0-alpha.2 --target /path/to/my-brain
node brain-framework/skills/brain/scripts/brain.mjs plugin add studio --target /path/to/my-brain
node brain-framework/skills/brain/scripts/brain.mjs status --target /path/to/my-brain
node brain-framework/skills/brain/scripts/brain.mjs validate
```

`init` seeds a new Brain or safely adds portable skills to an existing vault. Existing `Brain.md` and unrelated files are preserved.

A private Brain commits a single portable dependency descriptor, `.brain/manifest.json`, plus the `.gitignore` rule that keeps installed dependencies out of its history. It never commits installed framework skills, installed plugins, or machine-local manager state (`.brain/local.json`, `.brain/managed-files.json`) — those are reproducible, not source of truth.

Run `sync` after any fresh clone (or whenever installed dependencies were deleted or lost) to restore `/skills/`, enabled `/plugins/`, and local checksum state from the tracked manifest and a resolved local framework checkout. `sync` refuses to write over an unmanaged file or a source whose framework version doesn't exactly match the manifest.

`update` never advances to a moving branch. It requires an explicit `--to VERSION` that must exactly match the source framework's own version, and it only rewrites the tracked manifest after every managed file has been safely reinstalled — a locally modified managed file blocks the entire update instead of being silently overwritten.

## Plugins

- `studio`: optional local rendering, interaction, annotation, and artifact persistence.
- `chess`: Chess.com and engine evidence guidance for agent-directed chess learning.

Plugins must retain useful fallbacks when optional capabilities are absent. Chess works through Markdown without Studio; Studio has no knowledge of chess pedagogy.

## Status

This repository is an early framework bootstrap. The file and plugin contracts may evolve before the first tagged release.
