# Orbit 2.0 — Slice 1 build brief

**Companion to** `orbit-2.0-functional-specification.md` (the functional contract) and
`index.html` (the same contract with screenshot evidence inline).

**What this document is for.** The specification states what Orbit 2.0 must do. It deliberately
states no sequencing, no architecture and no technology, so it has no first step. This brief
supplies one: the smallest slice that is worth building, what it must satisfy, and what is
explicitly excluded from it.

---

## Before any code: close the decisions the specification leaves open

The specification is silent on implementation by design. Five decisions have to be made before a
line of code, because every later choice depends on them. Record them, with the reasoning, in a
short architecture document of your own.

| Decision | What has to be settled |
|---|---|
| **Execution model** | Where work runs, how it survives a restart, and how a run in progress is reconciled after an interruption. §10 requires a run to be cancellable, resumable and never left unresolved. |
| **Persistence and immutability** | How a published version is made immutable in fact, not by convention, and how an append-only audit history is enforced. §4 and §12 depend on this being structural. |
| **Evidence storage** | Where artefacts live, how integrity digests are produced and checked, and how redaction happens *before* an artefact is stored. §10 and §12. |
| **Identity** | How an actor is established by the platform rather than supplied by the caller. §2 and §12 are unbuildable without this, and retrofitting identity is expensive. |
| **What a "registered application" is** | The unit a workflow is attached to: its practice and live hosts, its surface, its credential reference. §7 and §8. |

Identity is the one to resist deferring. Every requirement in §2 and §12 — attribution, separation
of duties, permission-denied behaviour, audit — assumes it, and the existing evidence shows what
happens when it is added late: actions that cannot be attributed to a person, and an audit history
that records what happened but not who did it.

---

## Slice 1: one complete loop

> A written procedure becomes a checked workflow, becomes an immutable published version, runs
> against one practice application, and leaves evidence a stranger can read.

This is deliberately the same shape as the loop that proved the existing product: one vertical
slice through every layer, rather than one layer built completely. It exercises the specification's
central claim — *tell what the agent did, and be sure it could not have done anything else* — end
to end, which no horizontal slice does.

### In scope

**Bring it in (§5).** One route only: written instructions. The author supplies a procedure as
text; Orbit proposes structured steps; the author corrects them. Questions, assumptions and risks
are surfaced against the steps they concern and block confirmation until resolved.

**Check the draft (§6).** A structured step editor over a closed set of step kinds. Declared,
typed inputs and outputs. Reorder, insert, edit and delete, each validated on save. No free-form
expression, no scripting.

**Confirm (§4, §5).** The author attests the procedure is correct and supplies an example value
for each way it can end. Confirmation fixes the procedure; later edits return it to draft.

**Test and activate (§4).** Publication mints an immutable version, refusing anything it cannot
resolve completely and naming the specific blocker. Each declared ending is proven by a test run
before activation.

**Run and read it (§10).** An operator starts a run from a generated request form, with inputs
validated before the run is created. The run page shows status, business outcome, declared outputs,
the step timeline, and evidence.

**Evidence (§10, §12).** Every run records: the exact version reference; validated inputs; run and
step status transitions; structured events; a screenshot at each material step and at the final
state; typed error data on failure; extracted values on success; integrity digests on every
artefact.

**Statuses (§4, §10).** The full workflow status vocabulary and the full run status vocabulary,
including the separation of technical status from business outcome. This separation is cheap now
and extremely expensive to introduce later.

### Out of scope for slice 1

Not "not required" — required, and not yet. Each has a section of the specification waiting for it.

| Excluded | Comes from |
|---|---|
| Roles, permissions, delegation, separation of duties | §2 — but **not** identity itself, see above |
| Recording a demonstration; uploading a document | §5 |
| Terminal and API surfaces; desktop, email, file, database | §7 |
| Decisions judged by a model; spend ceilings | §9 |
| Scheduled, event-driven and externally triggered execution | §10 |
| Human tasks, approvals, escalation, hand-off | §2, §10 |
| Monitoring dashboards, alerting, notifications | §11 |
| Retention, environment promotion, export | §12 |
| Diagnosing and proposing an adjustment after an application changes | §11 |

One inclusion worth arguing about: **halting rather than acting on something Orbit cannot
confidently identify** (§11) belongs in slice 1 even though diagnosis and proposals do not. It is
the behaviour that makes the product's central claim true, and a system built without it acquires
the habit of proceeding on a best guess.

---

## Acceptance criteria

These are lifted from the specification, not invented here. Each is directly testable.

**The loop**

1. A procedure supplied as text produces a structured workflow whose steps the author can correct.
2. An interpretation that fails validation stores **nothing** — not the valid parts — and says so (§5).
3. A workflow with an outstanding question, unconfirmed assumption, undecided exception or
   unacknowledged high risk cannot be confirmed, and the blocker is named with a link to it (§4).
4. Publication of an incomplete workflow is refused, naming the specific blocker (§4, §13).
5. A published version cannot be altered. Editing the workflow it came from does not change it (§4).
6. Every run names the exact version that executed (§4, §12).

**Outcomes and evidence**

7. A run that correctly establishes a record does not exist is **succeeded** with a business
   outcome of *not found*, carries no error, and is never displayed as a failure (§10).
8. A run that fails produces a typed error naming the kind of failure and the step, and retains
   every artefact captured before it stopped (§13).
9. A run can be reconstructed from stored records alone, without re-running anything (§10).
10. Every artefact carries an integrity digest, and a digest mismatch is reported as an integrity
    failure rather than served (§12).
11. A value supplied as a secret never appears in inputs, outputs, events, logs or any artefact (§2).

**Refusals**

12. Each of the §13 authoring rows behaves as the table states.
13. A list distinguishes *nothing yet*, *nothing matching*, *not loaded yet* and *could not load*,
    and never uses an empty screen to report a failure (§3).

**Governance**

14. Confirming, publishing, activating and starting a run are each attributed to an actor
    established by the platform, and each appears in an append-only history (§12).

---

## How to work with the specification from here

- **Give an agent the Markdown, never the HTML, and never the screenshots.** The images are
  evidence for human reviewers. The full Markdown is ~20,000 words; hand over the two or three
  sections a task actually needs, not the whole file.
- **Write the new repository's own scope rules first.** `starter/CLAUDE.md` beside this file is a
  starting point: it states the rules that hold regardless of the slice, and names the current one.
- **Use §4, §10 and §13 as the test plan.** The status tables and the error matrix are already
  written as testable behaviour; they are not prose to be translated.
- **Keep a "what has shipped" document** updated as the authoritative record of the current state,
  separate from the specification, which describes the destination and should not be edited to
  match progress.

## What slice 2 should be, and why

Add the second way in — **recording a demonstration** — rather than the second surface or the
first role. It is the requirement most likely to invalidate slice 1's data model, because it
produces a workflow and its evidence from one interaction rather than from an author's text. Find
that out while the product is small.
