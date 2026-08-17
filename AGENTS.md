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
- Agent-authored material is a claim awaiting a test, never evidence of learning. This holds however well made it is, and applies to the agent's own notes and explanations first.
- Keep the agent off the learner's critical path. Agent turns cost wall-clock the learner spends waiting, so prefer one substantial self-paced artifact with its feedback authored up front over a drip of prompts each gated on a reply. Reserve live back-and-forth for work that is genuinely conversational.

"Smallest useful next practice" and "one substantial artifact" are not in tension: the unit is still the smallest thing that will move this learner, and the point of the second rule is that a unit should not be fragmented into round-trips. Do not read it as licence to generate a syllabus.

## Ownership

- Knowledge, learner profiles, sessions, annotations, and generated artifacts are user-owned.
- Framework skills and installed plugin code may be managed by Brain.
- Never silently overwrite user-owned or locally modified files.
- Keep secrets and machine-specific credentials out of committed knowledge.

## Dependency model

- A private Brain instance tracks `.brain/manifest.json` (portable: framework repository, exact version, enabled plugins) in Git. It ignores installed dependencies: `/skills/`, `/plugins/`, `.brain/local.json`, and `.brain/managed-files.json`.
- After a fresh clone, or whenever installed dependencies look missing, run `brain sync --target PATH` to restore them from the tracked manifest and a resolved local framework checkout. Do not hand-copy skills or plugin files to "fix" a clone.
- Durable changes to shared behaviour belong in this framework's (or a plugin's) source, not in an installed copy inside a private Brain. Reinstall with `sync` or `update` after making the change upstream.
- `brain update --to VERSION` only ever moves to an explicit, exact release or commit that matches the source framework's own descriptor version — never an implicit "latest" or a moving branch.

## Portability

- Use `[[wikilinks]]` for internal note references when editing an Obsidian vault.
- Preserve a useful Markdown fallback for interactive knowledge where practical.
- Do not require a specific agent, model provider, editor, renderer, or transport unless the user explicitly chooses one.

## Plugins

Plugins provide tools, skills, schemas, renderers, or other capabilities. They do not dictate a fixed learning workflow. Optional capabilities progressively enhance a session and must have a documented fallback.

Run `node skills/brain/scripts/brain.mjs validate` after structural framework changes.
