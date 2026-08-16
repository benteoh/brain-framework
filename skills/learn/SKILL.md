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

## Durable structure

Every subject gets the same shape, so a new subject — or a new domain plugin — never needs its own bespoke file convention:

```
Learning/<Subject>/
├── <Subject>.md            # subject map: goal, a Subjects table (name | confidence 1-5 | status),
│                            # an Open Questions list, links to session notes
└── Sessions/
    └── <date> <topic>.md   # subjects touched, focus, what was covered, key insights/evidence,
                             # subjects updated, open questions raised
```

"Current focus" is whichever row of the Subjects table is marked "In progress" — never a separate file. A domain plugin may add its own files under `Learning/<Subject>/` for evidence with no generic equivalent (a vocabulary log, imported games, engine analysis), but it must extend this shape rather than reinvent it.
