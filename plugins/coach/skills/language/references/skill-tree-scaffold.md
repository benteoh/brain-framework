# Skill-tree scaffold (generic)

The skill tree's node *shape* is generic and framework-owned. Its *content* is language- and
learner-specific and is generated only the first time a node becomes the learner's active focus
— never shipped as static per-language data in this plugin.

## Fixed skeleton (CEFR-flavored, functional milestones)

Same skeleton for any target language:

1. **Basic exchanges** — greetings, self-introduction, concrete needs, simple questions and
   answers.
2. **Past/future narration** — recounting what happened, describing plans, sequencing events in
   time.
3. **Opinion and nuance** — expressing preference, agreement/disagreement, hedging, comparison.
4. **Abstract and professional register** — discussing ideas, arguing a position, functioning in
   formal or workplace contexts.

Treat these as functional milestones, not a rigid grammar syllabus — a learner's actual path
through them, and the specific grammar/vocabulary that fills each one, is generated live from
the agent's own linguistic knowledge at the moment that node becomes active, calibrated to the
learner's stated level and goal.

## Source of truth

`Learning/<Language>/<Language>.md`'s Subjects table — the same subject-map shape the core
`learn` skill uses for every subject (name, confidence 1–5, status) — is the source of truth for
mastery state; the four functional milestones below are that table's rows, not a separate
`Progress.md`. A future interactive progress-tree artifact (Studio, using the `dataviz` skill
when it is actually built) would only *read* this table and let a click jump into a test or
lesson for that node — never the reverse. Mastery state must never live only inside an artifact.

## Instantiation rule

When `Learning/<Language>/<Language>.md` is created, or a new row's status becomes "In progress,"
generate that node's content (the specific grammar points, vocabulary set, or functional tasks)
for this learner's language and level at that time. Do not pre-populate example content for any
language in the framework repo.

Generating a node's content now means creating its subject doc — `Learning/<Language>/<Stage
Name>.md` — per the core `learn` skill's Subject docs contract (Key Ideas, Open Questions, So What
For Me, Belief Updates, Related), not just deciding what to teach in the moment and leaving it
undocumented. The Subjects table row for that stage wikilinks straight to the subject doc, the
same way any other subject map's rows link to theirs. A later session that revisits an
already-instantiated stage updates the existing subject doc rather than creating a new one.
