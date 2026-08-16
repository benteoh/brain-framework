---
name: learn
description: Start or continue an evidence-led learning session that adapts to the learner's goals, prior performance, and available tools.
---

# Learn

Use this skill when the user wants to learn, practise, or continue a subject.

## Session contract

1. Read `Brain.md` and the smallest relevant set of learner-owned notes.
2. Establish the performance the learner wants to improve and the evidence currently available.
3. Choose the smallest useful activity: explanation, recall, worked example, simulation, critique, or real task.
4. Let the learner do meaningful work before giving away the answer.
5. Diagnose observable mistakes. Label inferred causes as hypotheses.
6. Adapt the next activity to the result rather than following a fixed curriculum.
7. Offer to save only durable outcomes: demonstrated ability, recurring difficulty, useful feedback, and the next review cue.

Prefer retrieval and transfer over rereading. A plugin may add domain tools or a richer interface, but the learning loop remains directed by the agent and must retain a Markdown fallback.

Do not treat source collection, chat length, or confident explanation as proof of learning.

Teach clearly, and engage genuinely when the learner pushes back or questions something — don't deflect. Keep responses tight: this is a conversation, not a lecture. Flag insights as they emerge — when something non-obvious or belief-changing surfaces mid-session, note it immediately rather than waiting for session end. When something the learner raises doesn't fit the current subject map, say so explicitly: it may be worth adding as a new subject.

## Durable structure

Every subject gets the same shape, so a new subject — or a new domain plugin — never needs its own bespoke file convention:

```
Learning/<Subject>/
├── <Subject>.md            # subject map: goal, a Subjects table (name | confidence 1-5 | status),
│                            # an Open Questions list, links to session notes
├── <Concept>.md             # one subject doc per row of the Subjects table (see below)
└── Sessions/
    └── <date> <topic>.md   # subjects touched, focus, what was covered, key insights/evidence,
                             # subjects updated, open questions raised
```

"Current focus" is whichever row of the Subjects table is marked "In progress" — never a separate file. A domain plugin may add its own files under `Learning/<Subject>/` for evidence with no generic equivalent (a vocabulary log, imported games, engine analysis), but it must extend this shape rather than reinvent it.

## Subject docs

Each row the subject map's Subjects table links to is a **subject doc**: `Learning/<Subject>/<Concept>.md`, one file per specific concept or topic — distinct from the subject map itself (the top-level index and Subjects table) and from session notes (a dated log of what happened in one sitting). The subject map's table links straight to it, e.g. a row rendered as `[[The Investment Loop]] | 2 | In progress`.

Notes capture **what was learned**, not what was said. Never transcribe — distill. Every subject doc has:

- **Key Ideas** — non-obvious, distilled bullets. No definitions. No obvious facts.
- **Open Questions** — unresolved things worth coming back to.
- **So What For Me** — personal application, not theory.
- **Belief Updates** — what changed ("I thought X → now I think Y").
- **Related** — wikilinks to other subjects whose concepts meaningfully overlap. Add this section whenever a doc references ideas covered elsewhere on the map. Keep inline content clean; let Related carry the cross-links.

### Confidence rubric (1–5)

The Subjects table's confidence column uses this scale:

1. aware it exists
2. can describe it roughly
3. can explain it to someone else
4. can apply it to real decisions
5. strong enough to defend under pressure

Only raise a level where understanding genuinely improved during the session — not because the subject was discussed.

## Wikilink conventions

Always use wikilinks when referencing another subject, session, or note — plain text references are dead ends in Obsidian: they don't appear in graph view or backlinks.

- Subject references: `[[The Inner Game]]`
- Cross-subject references inside a doc: `[[Portfolio Construction]]`
- Display text when filename differs from display name: `[[Competitive Advantage and Moats|Competitive Advantage & Moats]]`
- Session references in the map: `[[2026-05-26 The Investment Loop]]`
