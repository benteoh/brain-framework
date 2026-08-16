---
name: learn
description: Start or continue an evidence-led learning session that adapts to the learner's goals, prior performance, and available tools.
---

# Learn

Use this skill when the user wants to learn, practise, or continue a subject.

## Session contract

1. Read `Brain.md`, the subject's `Profile.md`, and the smallest relevant set of learner-owned notes.
2. Establish the performance the learner wants to improve and the evidence currently available.
3. Choose the smallest useful activity: explanation, recall, worked example, simulation, critique, or real task.
4. Let the learner do meaningful work before giving away the answer.
5. Diagnose observable mistakes. Label inferred causes as hypotheses.
6. Adapt the next activity to the result rather than following a fixed curriculum.
7. Offer to save only durable outcomes: demonstrated ability, recurring difficulty, useful feedback, and the next review cue.

Prefer retrieval and transfer over rereading. A plugin may add domain tools or a richer interface, but the learning loop remains directed by the agent and must retain a Markdown fallback.

Do not treat source collection, chat length, or confident explanation as proof of learning.

## Know the learner before teaching them

Every subject has a `Learning/<Subject>/Profile.md`: current level and how it was established, connected evidence sources (accounts, handles, repositories, exports), goals, time available, agent-maintained strengths and weaknesses each linked to the evidence supporting it, and how this learner likes to be taught.

**If no profile exists, building one is the session's first activity** — and derive it from evidence rather than from an interview wherever the domain allows. A coach that can read the learner's actual performance should do that first and ask only what the evidence cannot answer. Interrogating someone about their own level produces worse data than measuring it, and spends the learner's patience before any teaching has happened.

Keep it current. When evidence contradicts the profile, update the profile; a stale profile is worse than none because it is trusted.

## Chapter mode is the default delivery

The default unit of delivery is a **chapter**: one self-contained, self-paced interactive document carrying 15–60 minutes of learning, with **two agent turns** around it rather than twenty inside it.

1. **Evidence and diagnosis** — one deep turn. Read the profile, pull real performance evidence, decide what this learner specifically needs next.
2. **Delivery** — the learner works through the chapter alone, at their own pace, with no agent in the loop.
3. **Debrief** — one turn. Read the structured events the chapter emitted, distil durable outcomes, update the subject map, set the next cue.

The reason is latency. An agent turn costs tens of seconds; a session with twenty learner actions spends that twenty times, fragmenting concentration at exactly the moment the learner has committed to an answer and is most receptive. Front-loading the thinking into one authoring turn converts that dead time into learning time.

This imposes one hard constraint: **author the feedback for anticipated answers up front**. For every exercise, write the accepted answers, why the right answer is right, why each wrong answer you expect is *tempting* and what it misses, a hint ladder, and a fallback for answers you did not anticipate. Where the domain has an oracle (a chess engine, a test suite, a compiler), consult it *before* authoring so anticipating wrong answers is grounded rather than guessed.

Two consequences worth stating plainly:

- **Chapter mode wants high reasoning effort, not low.** The old advice to drop effort for responsiveness applied to turn-by-turn drip sessions. Here there are two turns and both compound across an hour of learner time.
- **Debrief from what they did, not from what they say they did.** The chapter reports which exercises were attempted, how many attempts, which hints were opened, which lines were explored. That is evidence; "how did that go?" is not.

Keep a chapter to what the evidence supports. A short chapter about a real weakness beats a long one padded to fill an hour.

Drip mode — one prompt at a time, agent responding live — remains correct for genuinely conversational work: a Socratic dialogue, a debugging session, an interview drill. Choose it deliberately, not by default.

Teach clearly, and engage genuinely when the learner pushes back or questions something — don't deflect. Keep responses tight: this is a conversation, not a lecture. Flag insights as they emerge — when something non-obvious or belief-changing surfaces mid-session, note it immediately rather than waiting for session end. When something the learner raises doesn't fit the current subject map, say so explicitly: it may be worth adding as a new subject.

## Durable structure

Every subject gets the same shape, so a new subject — or a new domain plugin — never needs its own bespoke file convention:

```
Learning/<Subject>/
├── <Subject>.md            # subject map: goal, a Subjects table (name | confidence 1-5 | status),
│                            # an Open Questions list, links to session notes
├── Profile.md               # who this learner is in this subject, and the evidence for it
├── <Concept>.md             # one subject doc per row of the Subjects table (see below)
├── Chapters/
│   └── <date>-<slug>.json  # authored chapter payloads, replayable
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
