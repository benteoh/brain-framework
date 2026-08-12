# Brain — Agent Contract

Brain is a learning system, not an information archive.

## Start here

1. Read `Brain.md` for the learner's current goals and maps.
2. Inspect `skills/` and installed `plugins/`.
3. Read the relevant `SKILL.md` completely before using a capability.
4. Prefer deterministic scripts for retrieval, parsing, validation, and measurement.
5. Use judgement for diagnosis, teaching, practice selection, and reflection.

## Learning standard

Work through this loop when it serves the user's goal:

**observe → diagnose → practise → perform → reflect → adapt**

- Distinguish exposure from demonstrated learning.
- Prefer evidence from unaided recall, transfer, decisions, and real performance.
- Record distilled insights and belief updates, not transcripts or source dumps.
- State uncertainty when a diagnosis is only a hypothesis.
- Choose the smallest useful next practice rather than generating a complete curriculum upfront.

## Ownership

- Knowledge, learner profiles, sessions, annotations, and generated artifacts are user-owned.
- Framework skills and installed plugin code may be managed by Brain.
- Never silently overwrite user-owned or locally modified files.
- Keep secrets and machine-specific credentials out of committed knowledge.

## Portability

- Use `[[wikilinks]]` for internal note references when editing an Obsidian vault.
- Preserve a useful Markdown fallback for interactive knowledge where practical.
- Do not require a specific agent, model provider, editor, renderer, or transport unless the user explicitly chooses one.

## Plugins

Plugins provide tools, skills, schemas, renderers, or other capabilities. They do not dictate a fixed learning workflow. Optional capabilities progressively enhance a session and must have a documented fallback.

Run `node skills/brain/scripts/brain.mjs validate` after structural framework changes.
