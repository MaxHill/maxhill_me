# Agent guidance

Read `CONTEXT.md` before you change code or docs.
It is the durable source for repo vocabulary and domain language.

## Planning and issue tracking

Use GitHub Issues for actionable work: bugs, scoped implementation tasks,
acceptance criteria, and work that is ready for an agent.
Use GitHub Discussions for exploratory planning: PRDs, design briefs,
open design questions, and proposals that are not ready as implementation
issues. When a Discussion becomes actionable, create linked Issues for
the work.

Keep ADRs in `docs/adr/`. Do not move them into planning folders.
Do not create durable planning artifacts in `.scratch/`, `plans/`,
`docs/agents/`, `docs/issues/`, `docs/prd-*`, or `docs/design-brief-*`.
Use root `PLAN.md` only as a temporary local scratch/review file when a
tool such as Plannotator needs a markdown plan. Do not commit `PLAN.md`.
If a plan needs to be durable or shared, move it to a GitHub Discussion
or a GitHub Issue, whichever is more applicable.
