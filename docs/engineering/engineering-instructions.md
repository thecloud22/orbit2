# Orbit 2.0 Engineering Instructions

## What Orbit is

Orbit turns a written business procedure into an agent that executes it against real business
applications and leaves evidence of everything it did, while the procedure itself stays readable
and stays the source of intent.

Every person who touches Orbit needs the same two things: **to be able to tell what the agent did,
and to be sure it could not have done anything else.** Every requirement serves one of those two
sentences. Where a capability would make either less true, Orbit refuses the capability.

## The authoritative documents

- `docs/orbit-2.0-functional-specification.md` — the functional contract. What the product must
  do, for every actor. It describes the destination, not the current state; **do not edit it to
  match what has been built.**
- `docs/slice-1-brief.md` — what is being built now, what is deliberately excluded, and the
  acceptance criteria for it.
- `docs/ACTIVE_TASK.md` — the authoritative record of what has actually shipped. Keep this current.
- `docs/decisions.md` — the architecture decisions, with reasoning. Nineteen are recorded and closed.
  Read it before proposing anything structural; a change to one of these is a change to
  architecture and needs approval, not a commit.
- `docs/decision-draft-model-driven-browser.md` — the draft that became Decision 6. It is
  **provenance, not a pending decision**: its body is preserved verbatim in `docs/decisions.md`,
  which is the record. Do not edit it, and do not treat it as a second source.

If a document contradicts this file, stop and name the contradiction rather than choosing silently.

## The current slice

**Slice 1: one complete loop.** A written procedure becomes a checked workflow, becomes an
immutable published version, runs against one practice application, and leaves evidence a stranger
can read. See `docs/slice-1-brief.md` for scope and acceptance criteria.

Everything outside that slice is *required and not yet*, never *not required*. Do not add an
excluded capability without an explicit scope change.

## Product rules that hold regardless of the slice

These are not implementation guidance. They are properties the product must have, and each one is
cheap now and expensive to retrofit.

1. **Refuse rather than guess.** Anything not fully understood is refused, with the specific
   blocker named. A workflow that cannot be resolved honestly is never published with a plausible
   interpretation of the missing part.
2. **Halt rather than act on something that cannot be confidently identified.** Never substitute a
   different control, field or operation for the one the published version calls for. A halted run
   is recoverable; silently wrong output is not.
3. **Nothing becomes live without a person.** No automated part of the system may move a workflow
   closer to being live. Proposing is not applying; accepting is not publishing.
4. **A published version is immutable, and every run names the version it ran.** Publication mints;
   it never edits. Archiving retires an identity and never alters or deletes a version.
5. **Technical status and business outcome are separate facts** and are never merged into one
   label. A run that correctly establishes a record does not exist has succeeded.
6. **Evidence is a product feature, not diagnostic output.** Every run must be reconstructable from
   stored records alone, without re-running anything.
7. **Bound every model call, and make the bound structural.** A model proposes; it never writes.
   Output is validated before anything is kept. A judged decision returns a choice from a list the
   workflow already declares — it cannot invent a branch, name a control, supply an address, or
   choose an action.
8. **Secrets are named, never held.** Users and workflows refer to a credential by name. A value
   supplied as a secret at run time is required afresh every run, never stored, and never appears
   in inputs, outputs, events, logs or any artefact.
9. **Redact before storing, not after.** Where a value cannot be redacted with confidence, withhold
   the artefact and record that it was withheld and why.
10. **Every action is attributable to an actor the platform established**, never to one the caller
    supplied.
11. **An empty screen is never used to report a failure.** Distinguish *nothing yet*, *nothing
    matching*, *not loaded yet* and *could not load* everywhere.
12. **Resolution is exact, and ambiguity is a refusal.** A named field, control or region either
    resolves to exactly one thing on the page or publication is refused. No fuzzy matching, no
    nearest-label, no closest reasonable candidate, no confidence threshold. **Two things matching
    one name is also a refusal** — ambiguity is a failure, not a tie to be broken. The refusal
    names what did not resolve and why, distinguishing *nothing matched* from *more than one
    matched*. A person resolves it by narrowing the address; Orbit never breaks the tie itself.
    A model may *propose* by judgement, because a person confirms it — but a proposal only enters
    a version by resolving exactly. See Decision 12.
13. **No arbitrary code in a workflow.** No scripting, no expressions, no dynamic evaluation, no
    shell. A step is one of a closed set the system can validate, permit, execute and produce
    evidence for. The absence of a "custom step" is a product guarantee, not a gap.

## Architecture rules

These are settled in `docs/decisions.md`, with the reasoning and the alternatives that were
rejected. The summary below is a pointer, not the decision — where the two differ, `decisions.md`
is right and this table is stale.

| # | Decision | In short |
|---|---|---|
| 1 | Identity | **Deferred past slice 1**, with the cost recorded. No actor record, no sign-in, no roles — and nothing fakes attribution in the meantime. |
| 2 | Execution model | A durable step journal in the store, advanced by a worker that leases runs. The step attempt is the safe boundary; a reconciler resolves interrupted runs on start-up and on a timer. |
| 3 | Persistence and immutability | PostgreSQL. Immutable tables with `UPDATE`/`DELETE` revoked from the application role, plus triggers. Content digest on every version. The tamper-evidence chain is deferred, its columns reserved. |
| 4 | Evidence storage | Content-addressed on local disk, behind an object-store interface. One capture path that redacts before storing; withholding is a recorded outcome, not an error. |
| 5 | Registered application | A stable identity, an append-only sequence of definition revisions, and a copy of the resolved revision inside the published version. The copy is what a run enforces. **One set of hosts — no practice/live split in slice 1.** A workflow names a *set* of applications and a step names which one; slice 1 fills the set with exactly one. |
| 6 | Model-driven browser | A model may drive a browser while a person authors. Never while a published version executes. Amended: with practice copies gone, the host allowlist is the only containment — treat it as a control, not a validation. |
| 7 | Model provider | OpenAI locally now, routed through Bedrock later, behind one interface. Redaction applies outbound, not only to stored evidence. |
| 8 | Where this runs | Local now; AWS `us-east-1` on Bedrock AgentCore later, United States only. The platform may decide where things run, never what is recorded. |
| 9 | Backend stack | TypeScript on Node. Every closed set declared once and shared with the interface, so a status cannot disagree with itself. No `any`. |
| 10 | Frontend | React over headless accessible primitives, with design tokens resolved per workspace at run time so branding is data, not a rebuild. Five components carry the specification: `StatusChip`, `EmptyState` (four variants), `OutcomePair`, `EvidenceItem`, `RefusalNotice`. |
| 11 | Authoring | **Model maps, Orbit verifies.** Orbit runs the loop and is the MCP client; the model has no connection to Playwright MCP and no tool that accepts an address. Snapshot refs never enter a published version. Weaker signals are corroboration, never fallback. |
| 12 | Resolution | Exact. Exactly one match or refuse. Ambiguity is a refusal. |
| 15 | The locator | Seven rungs ordered by how often each returns the **wrong** element, measured against `demo/legacy-portal`. `text` and `structural` are refused without corroboration, because one match can still be the wrong match. |
| 14 | Step kinds and values | Ten kinds — `open`, `enter`, `activate`, `read`, `collect`, `check`, `branch`, `for each`, `hand off`, `end`. Five types — text, number, date, yes/no, list of rows. A step names a value; there is no syntax, so "no expressions" is true by construction. |
| 13 | A judged step | Shape fixed, **not built in slice 1**. The model returns one of a list the workflow declared, judged against pinned policy, with a confidence floor below which it hands off. It never names a control, supplies an address or chooses an action. |
| 16 | Prompt injection | Untrusted text fenced as data, instruction-like sentences flagged and kept out, a data-changing press only when the line it cites asks for it. |
| 17 | The procedure is edited in place | An edit is a revision, numbers never shift in a draft, Orbit maps only what changed, a question is left rather than held, the chat is open until publication. |
| 18 | Green screens | A connector owns what knows its screen; Orbit drives TN3270 through s3270, never decoding it; a binding is screen, label and address, refused on any disagreement; keys are named by their verb; a hidden field is never read. |
| 19 | An agent across applications | Each line placed on an application; moving is an `open`; a value read on one is typed on another, through a code table where they differ; a part-way stop says what each system holds; nothing runs again blind. |

Rules that follow from the product regardless of those choices:

- The business procedure, the executable artefact, and the record of a run are three separate
  things. Do not collapse them.
- The layer that executes must not decide business order; it carries out an approved artefact.
- The layer that executes must sit behind an interface, so a second surface can be added without
  reopening the first.
- Binary artefacts are stored outside the transactional store; their metadata and links inside it.
- Identity is established at the boundary and threaded through; it is never a parameter a caller
  can set. Slice 1 has no identity at all (Decision 1) — which means no command accepts an actor
  identifier from a caller in the meantime, so that the eventual retrofit does not begin in the
  one shape this rule forbids.

## Where slice 1 knowingly falls short

The product rules above are the destination and do not bend. These are the places the **current
slice** does not reach them, by decision rather than by oversight. Each is recorded in
`docs/decisions.md` and tracked in `docs/ACTIVE_TASK.md`.

| Not satisfied in slice 1 | Which rule or criterion | Why | Unblocks when |
|---|---|---|---|
| Acts are not attributed to an actor | Rule 10; acceptance criterion 14; §12, §2 | Decision 1 defers identity in full | Identity is built |
| The audit history is append-only but not tamper-evident | §12 | Decision 3 defers the hash chain | Identity is built (the chain protects little before then) |
| Artefact access is not recorded | §2 | There is no actor to record it against | Identity is built |
| There are no environments — no practice/live split, no promotion, no environment on a run | §12 | Decision 5 item 6 removes the concept to get one loop working end to end | Environments return, with roles |
| A test run cannot "execute against the practice copy" | §10 | There is no practice copy; it is marked as a test and runs against the one registered application | Environments return |

The first three are one gap, not three. Do not work around any of them. In particular: if a
test for acceptance criterion 14 is failing, the correct action is to leave it failing and marked
as pending against Decision 1 — **never** to introduce a placeholder actor, a constant
`created_by`, or a `"system"` string standing in for a person, which would satisfy the test and
break the requirement it exists to check.

## Coding standards

- Strict type checking. No escape hatches into untyped values.
- Validate at every boundary: inbound requests, persistence, and anything returned by a model.
- Prefer discriminated unions for anything with a closed set of kinds — steps, events, errors,
  statuses.
- Add tests for every new behaviour. The status tables and the error matrix in the specification
  are already written as testable behaviour; use them directly.
- Add a migration for every schema change.
- Preserve causal context on persisted records and events: version, run, step, attempt, actor.
  Slice 1 carries every one of these except the actor, which is absent rather than faked
  (Decision 1). Leave the fact unrecorded; do not substitute a stand-in.
- Keep comments for non-obvious decisions, not for routine code.
- Avoid broad refactors unless asked.
- Update documentation when a contract, a command or the architecture changes.

## Interface standards

The interface is part of the product, not a window onto it. Build it to the standard of a SaaS
product a stranger would pay for — not to the standard of a demonstration that proves the backend
works. A prototype-grade interface is not a neutral placeholder here: the specification's central
claim is that a person can *tell what the agent did*, and a person only ever tells that through
the interface.

Most of the bar is already specified behaviour rather than taste. Build these because §3, §4 and
§10 require them:

- **One derived status, identical everywhere.** §4: computed from facts the system holds, never
  stored, so it cannot disagree with itself. The same workflow shows the same chip in the list, on
  its page and anywhere it is referenced.
- **Name the next action and what blocks it**, wherever a status is shown. Never a status the
  reader has to interpret into an action.
- **Four empty states, never one.** §3 and product rule 11: *nothing yet*, *nothing matching*,
  *not loaded yet* and *could not load* are four different screens. An empty screen never reports
  a failure. This is the single most common place a prototype-grade interface lies to its user.
- **Technical status and business outcome shown as two separate facts**, each labelled. §10: a run
  that correctly establishes a record does not exist has succeeded, and is never coloured as a
  failure.
- **Evidence is readable in place.** §10 and §12: a screenshot previews inline, each artefact
  carries its size, type and digest, and the run page answers "what did this do" without leaving it.
- **Screenshots, never video.** An authoring session is evidenced by a screenshot at each material
  action plus the reasoning record — what the model was shown, proposed and was told, in order,
  including the turns that produced nothing. Text answers "why does it say this"; frames do not.
- **A withheld artefact is shown as withheld, with its reason** — not as a broken image, and not
  omitted.
- **Absent facts are shown as absent.** While identity is deferred, the interface says attribution
  is not yet recorded. It does not show a blank, and it does not invent a name.

And the ordinary craft, which is not optional either:

- Real loading, empty, error and success states for every view. No spinner that never resolves,
  no layout that jumps when data arrives.
- Keyboard reachable, visible focus, labelled controls, sufficient contrast. Tables that stay
  readable at the row counts this product will actually reach.
- Consistent spacing, type scale and colour from a defined set — not values chosen per component.
- Destructive and irreversible actions confirm, and say what cannot be undone (§4 requires this
  for discarding).
- Copy is written for the reader, in the specification's own vocabulary. The status names, outcome
  names and refusal messages are contracts, not labels to improvise.

Do not ship placeholder text, lorem ipsum, unstyled default controls, or a screen that only works
with the one fixture it was built against.

## Development workflow

Before implementing anything non-trivial:

1. Read this file, the slice brief, and the specification sections the task touches.
2. Inspect the existing code.
3. State the approach, the files likely to change, the assumptions, the trade-offs and the test plan.
4. Wait for approval if the task changes architecture, a data contract, a public contract or a
   security boundary.
5. Implement only the bounded task.
6. Run formatting, type checking, tests, and the relevant end-to-end tests.
7. Report changed files, commands run, test results and known limitations.

When uncertain, prefer the smallest implementation that satisfies the slice's stated acceptance
criteria.

## Commands

**[decide]** — still open. No package scripts exist yet. Record the real commands here as they are
created, verified against the package manifest. Do not invent them, and do not copy them from
another project.


## Model routing

Read and follow `docs/engineering/model-routing.md` before planning, delegating, modifying code, or committing work.

Use Opus by default. Sonnet is limited to explicitly bounded test, TypeScript, lint, formatting, and mechanical repair tasks after Opus has established the intended behavior.