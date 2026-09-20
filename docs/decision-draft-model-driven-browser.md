# Draft decision — where a model may drive a browser

**Status:** draft, for `docs/decisions.md` in the new repository.
**Context:** the intention to use a model-driven browser tool (Playwright MCP or equivalent) for
the AI-driven flow.

## Decision

A model may drive a browser **while a person is authoring**. A model may not drive a browser
**while a published version is executing**.

## Why the line is there

The specification's central claim is that a reader can tell what the agent did and be sure it
could not have done anything else. Four requirements depend on it directly:

| Requirement | What it needs |
|---|---|
| §4 — a published version is immutable and every run names it | Two runs of one version behave the same way |
| §10 — a run is reconstructable from stored records alone | What executed is knowable without re-running |
| §12 — version and execution traceability | The thing approved is the thing that ran |
| §13 — halt rather than act on what cannot be confidently identified | Something fixed to compare the live screen against |

A model choosing actions at run time satisfies none of them. Two runs of the same version would
differ, the approved artefact would not be what executed, and the "could not have done anything
else" claim becomes untrue — there is no bound on what it could have done.

None of that applies during authoring. Authoring is *supposed* to be exploratory, it is
non-deterministic by nature, and **a person reviews the result before anything is published**.
That review is the control, and it is already required by §5.

## What this permits

- The authoring session opens the registered application's **practice copy** and a model works
  through the described procedure, looking at pages and deciding what to do.
- Every turn is captured as authoring provenance: what it did, why, what it was looking at, the
  page state at that moment, and what the turn cost (§5, §12).
- The session **emits a durable artefact** — the structured workflow. That artefact, not the
  session, is what a person reviews, confirms and publishes.
- Execution replays the artefact. No model is consulted.

## Constraints that come with it

1. **Practice copies only.** An authoring session never touches a live system. The registry
   already separates practice hosts from live hosts (§8); enforce it at the point the session
   opens a page.
2. **Enforce the address allowlist yourself.** A browser tool will navigate anywhere it is asked
   to. The permitted hosts are a property of the registered application, checked by Orbit before
   the navigation happens — never a rule the model is asked to follow.
3. **Capture is not optional.** An authoring session whose turns were not recorded produces a
   workflow nobody can review the origin of. The provenance record is the deliverable as much as
   the workflow is.
4. **Meter every call**, including the ones that produced nothing usable (§9).
5. **Prefer structured page representations to screenshots** for what the model is shown: cheaper,
   and it makes what the model saw reviewable as text. Keep screenshots as evidence for the human.
6. **Session lifecycle is real work.** Browser sessions are stateful, expire, and do not survive a
   restart. Decide what happens to an authoring session when the process stops, and say so.

## What would have to change if a model drove execution too

State this explicitly rather than discovering it later. Run-time model control would require
renegotiating: §4 (what immutability means when behaviour varies), §10 (what "reconstructable"
means when the path was chosen live), §12 (what was approved, if not the behaviour), and the
product overview's central claim. That is a different product with a different value proposition
— defensible, but it is not the one this specification describes, and the two cannot be held at
once.
