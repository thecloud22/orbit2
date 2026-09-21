# Orbit 2.0 — what has actually shipped

The authoritative record of the current state. `docs/orbit-2.0-functional-specification.md`
describes the destination and is never edited to match this file; this file is edited to match
reality.

**Last updated:** 2026-09-20

---

## Status

**One loop runs, end to end.** A published version executes against a real browser and leaves
evidence a stranger can read. Fourteen decisions are closed in `docs/decisions.md`.

| | |
|---|---|
| `packages/contract` | The closed sets, declared once. Ten step kinds, five value types, the error and event vocabularies. Unknown keys refused; a secret accepted in one field of one kind. |
| `apps/api` | Nine migrations. Immutability enforced by revoked privileges **and** a trigger, proved by a test that asserts the owner is refused too. Artefacts verified against their digest when served. Publication refuses an unconfirmed workflow, a half-written step and a step no path can reach. §6 step editing, gated on whether a change makes the draft worse rather than on whether it leaves it perfect. §10's run controls: cancel, retry, re-run. |
| `apps/worker` | Claims a run with a lease, drives Chromium, records every attempt, event and screenshot. Consults no model, and cannot. |
| `apps/web` | Ten screens on a real router. The run page reads real records — status and outcome as two facts, only the technical one coloured — and carries the run controls, naming the reason a retry is not offered rather than hiding the button. The draft screen is a place you work: steps move, delete and insert, and a refused edit says why in the contract's own words. |
| `demo/*` | Four portals Orbit is pointed at. |

**Proved against a real page, not a fixture:** two runs of one version differing only in their input.
The loan number that does not exist comes out **succeeded**, conclusion *no such file*, **no error** —
acceptance criterion 7. Not one binding reads a `data-testid`.

## What is closed

| # | Decision | Chosen |
|---|---|---|
| 1 | Identity | **Deferred past slice 1**, cost recorded |
| 2 | Execution model | Durable step journal, worker leases runs, reconciler resolves interruptions |
| 3 | Persistence and immutability | PostgreSQL, `UPDATE`/`DELETE` revoked on immutable tables; chain deferred |
| 4 | Evidence storage | Content-addressed on local disk, behind an object-store interface; redact before storing |
| 5 | Registered application | Versioned definition, copied into the published version; one host list. A workflow names a **set** of applications, filled with one |
| 6 | Model-driven browser | Authoring only, never execution |
| 7 | Model provider | OpenAI now, Bedrock later, behind one interface |
| 8 | Where this runs | Local now, AWS `us-east-1` later. United States only |
| 9 | Backend stack | TypeScript on Node |
| 10 | Frontend | React, headless primitives, tokens resolved per workspace at run time |
| 11 | Authoring | Model maps, Orbit verifies |
| 12 | Resolution | Exact. Ambiguity is a refusal |
| 13 | A judged step | Shape fixed, not built in slice 1. One answer from a declared list, against pinned policy |
| 14 | Step kinds and values | Ten kinds, five value types, and how a step names a value |
| 15 | The locator | Seven rungs ordered by how often each is **wrong**, measured against `demo/legacy-portal` |

Amended since: evidence on disk now and S3 later with **redaction deferred** — safe only because
capture starts after sign-in; a registered credential held **encrypted in the store**; provider and
model chosen in an **environment file**.

**Diverges from the spec, on the record, as of 2026-09-20:** a registered credential's value can
now be set through the Admin screen (encrypted before it is written), not only out of band. See
[`docs/decisions.md`](decisions.md#amendment-to-decision-5-item-5-a-value-may-be-set-through-the-product)
— this is the one place slice 1 moves away from
[`docs/orbit-2.0-functional-specification.md`](orbit-2.0-functional-specification.md) §8 rather
than toward it, and it is recorded there in full rather than left for a reader to notice.

## What slice 1 will knowingly not satisfy

Carried from day one so that none of it is discovered at the end. Each is a decision, not an
oversight, and each is recorded in `docs/decisions.md`.

| Not satisfied | Requirement | Because | Unblocks when |
|---|---|---|---|
| Acts are not attributed to an actor (acceptance criterion 14) | §12, §2 | Decision 1 defers identity in full | Identity is built |
| The audit history is append-only but **not tamper-evident** | §12 | Decision 3 defers the hash chain | Identity is built |
| Artefact access is not recorded | §2 | There is no actor to record it against | Identity is built |
| No environments — no practice/live split, no promotion, no environment on a run | §12 | Decision 5 item 6 | Environments return, with roles |
| A test run cannot "execute against the practice copy" | §10 | There is no practice copy | Environments return |

**Do not work around any of the first three.** If the test for acceptance criterion 14 is failing,
leave it failing and marked pending against Decision 1. Never introduce a placeholder actor, a
constant `created_by`, or a `"system"` string standing in for a person: it would make the test pass
and the requirement false, in a history that cannot afterwards be corrected.

## Open, and blocking

| Item | Owner | Note |
|---|---|---|
| The application slice 1 runs against | **Karthik** | To be provided. Legacy, server-rendered, WebSEAL-fronted. |
| One accessibility snapshot of a real WebSEAL page | **Karthik** | Determines whether the locator ladder in Decision 11 needs a rung below structural anchors. Cheap to get, expensive to discover late. |
| The locator's stored shape | Claude | One typed column on `step`, and the only hole left in Decision 14. To be settled from **measurement** against `apps/legacy-portal`, not from argument. |
| The terminal path | Claude | Not built. `demo/terminal-portal` warns how: drive a real emulator, never decode the datastream, or a misreading on Orbit's side is cancelled by the same misreading in the fixture. |
| The locator ladder, from measurement | Claude | **Closed** as Decision 15. 181 elements measured against `demo/legacy-portal`; the ladder is ordered by how often each rung is *wrong*, and `text` and `structural` are refused outright without corroboration because 28 of 54 structural matches were confidently wrong. |

## Outstanding in slice 1, not yet built

| Item | Note |
|---|---|
| Criterion 12 — each §13 authoring row behaves as its table states | Not walked row by row. |
| A conditional path takes no action | Orbit watches one path, so where a procedure says to *do* something when conditions fail — decline the file, send it back — it reports the conclusion and raises a question rather than guessing at an act it never saw. |
| Retry as a *step-level* policy | §9 lets a designer configure attempts, delay and which kinds are worth retrying per step. Slice 1 has the operator-initiated retry only, and one contract-wide set of retryable kinds. |
| Waiting on a person | `waitingForAPerson` is a status the schema allows and nothing produces. `handOff` halts instead. |

## Open, not blocking

- Which OpenAI model, and the browser tooling behind the authoring session (Decision 7 fixes the
  interface; the model and driver reach no record).
- When a judged step is built (Decision 13 fixes its shape; slice 1 hands off instead).
- Recording a demonstration as the second way in — slice 2 by the brief, and cheaper on these
  applications than the model-driven route, because the person clicks the actual control.
- When identity is built. Decision 1 names the trigger rather than a date: the first real procedure
  published by a real person in this system.
- External anchoring of the audit chain. Columns reserved, unwritten.
- Retention and expiry (§12), roles and permissions (§2), environments and promotion (§12).
- The real commands, once a package manifest exists. `docs/engineering/engineering-instructions.md`
  still carries a `[decide]` marker for them.

## Log

| Date | What happened |
|---|---|
| 2026-09-20 | Decisions 1–8 recorded. Identity deferred by decision, with its cost itemised. |
| 2026-09-20 | Practice/live distinction removed from slice 1; Decision 6 constraint 1 amended, the host allowlist becomes the only containment. |
| 2026-09-20 | Decisions 9–12 recorded: TypeScript/Node, React with headless primitives, *model maps Orbit verifies*, exact resolution. |
| 2026-09-20 | Engineering instructions moved to `docs/engineering/`; all documentation now under `docs/`. |
| 2026-09-20 | Interface designed as 23 screens on a canvas, in the customer palette. Home drawn in both states, day one and in use. |
| 2026-09-20 | Error and event vocabularies enumerated from §13's matrix and from what the executor actually writes, and constrained in the database. A succeeded run cannot carry an error and a failed one must name its kind. |
| 2026-09-20 | One loop end to end: schema, worker, browser, evidence, run page. |
| 2026-09-20 | Amendments: redaction deferred with a sign-in interlock; S3 named as the eventual store; a registered credential held encrypted and written out of band; provider and model moved to configuration. |
| 2026-09-20 | Decision 14 recorded: ten step kinds, five value types, how a step names a value, the authority flag, `for each` semantics, and calculation deferred. |
| 2026-09-20 | Practice portals moved to `apps/`; ADR references from another project removed; repo made a pnpm workspace with a strict shared tsconfig. |
| 2026-09-20 | Decision 15 recorded: the locator ladder from 181 measured elements, ordered by how often each rung is wrong rather than by how specific it looks. |
| 2026-09-20 | §6 editing built, then corrected twice. An inserted step is deliberately incomplete and could not be parsed by the published schema, so inserting one made the draft unreadable; a draft's steps are now carried as they are. And the gate refused any edit whose result was broken, which trapped an author in the state they were trying to leave — it now refuses an edit that makes things *worse*. |
| 2026-09-20 | Publication was minting versions of workflows nobody had confirmed. §4's status table is explicit — "cannot be published until confirmed" — and with attribution deferred, confirmation is the only human act on the whole record. |
| 2026-09-20 | A step no path can reach is now a blocker. An ending dragged to the front stranded everything behind it and nothing objected, because an unreachable step is on no path that could run out. |
| 2026-09-20 | §10's run controls built. Cancellation proved cooperative against a live run: asked to stop part-way, it stopped before step 3 with two steps and their evidence complete. |
| 2026-09-20 | Two evidence faults found by looking at the screen. The store was cwd-relative, so the worker wrote where the API did not read; and the run page reported *every* image failure as an integrity failure, telling an operator that absent evidence had been altered. A false provenance alarm teaches people to discount the real one. |
| 2026-09-20 | Criterion 2 closed. An interpretation is validated as a whole before anything is written, and a refusal names every bad step. Storing a draft was split from producing one, because a rule that can only be exercised by whatever a model said that day is a rule nobody can rely on. |
| 2026-09-20 | A demonstration can be recorded from the screen, and is stored. The CLI never stored one — it printed what it saw and exited — so §5's second way in produced nothing that survived the process. Queued like an authoring session; the person says they are finished through a column, because the screen and the browser are held by two processes. Three recorder defects found by making it run: it named a filled field by the value typed into it, every action was lost to "execution context was destroyed" on an application that navigates when touched, and the failure was swallowed so a whole demonstration could vanish silently. |
| 2026-09-20 | A procedure can be brought in from the screen. The button had been disabled, reading "authoring runs from the worker for now" — true, and not a product. The API queues an authoring session and the worker claims it with the same lease a run uses, so the browser stays where Decision 2 put it. The page also never said which application it would use; the command line took whichever was registered most recently, which is defensible in a developer tool and indefensible to hide from somebody about to point an agent at a system. |
| 2026-09-20 | Conditions. Asked to map "approve only when the score is over 700", Orbit produced a workflow that read the three figures, ignored them and pressed Approve — the vocabulary had no way to say "only if", so the thresholds were silently dropped. An act may now carry its conditions, Orbit checks each against what has actually been read and builds a branch per condition in front of the guarded steps. |
| 2026-09-20 | Comparisons were evaluated for absence only; everything else fell through to "is the left side present", so a branch on a threshold took the yes path for any value at all. Every type and operator is now written out and anything undecidable halts. A number is parsed from what a screen actually shows — "32.50%", "$457,500" — and both operands are recorded as they arrived. |
| 2026-09-20 | `changesARecord` and `may_change_records` were hardcoded false, so a step pressing "Approve file" declared it changed nothing and the run page told readers "It changed: Nothing" about a run that approved a loan. The act says, verified against the element; the version derives it from its steps. |
| 2026-09-20 | Authoring can reach two conclusions. The walk maps the work but cannot map a conclusion, so a closing turn asks the model what the procedure's endings are called and which produced value's absence separates them; Orbit checks every part of that answer and builds the branch itself. Criterion 7 proved from an authored workflow for the first time: one version, two runs differing only in input, the missing file **succeeded** as *fileNotFound* with no error. |
| 2026-09-20 | Execution put behind a `Surface` interface, proved by running the executor against a surface made of arrays. That found a browser assumption a grep would have missed: evidence capture had `image/png` written into it. A version now carries its own surface, and one that does not say what it drives is refused rather than assumed. |
| 2026-09-20 | Every run had been reporting `noteRate: null`. The read was bound to `6.375%` — the value on the page the day it was authored — so it searched for the answer. The model was not at fault; it named "Note rate" correctly. Reads now bind to what labels the value, and a circular read is refused at publication. Proved by reading 6.625% from a different file. |
| 2026-09-20 | Confirmation made real. A question was closed by citing its id, so nothing recorded what was decided — which is how a version was published with its conclusion named "unnamed". An answer is now something somebody wrote, and the screen asks for it, for the conclusion's name, and for the example values the activation test will run with, all of which it had been inventing. |
| 2026-09-20 | A version declaring no conclusion could be activated, because the gate is "every declared ending proved" and an empty list passes. An empty gate is not a passed gate. |
| 2026-09-20 | Decision 13 recorded (a judged step). Amendments: Decision 5 takes a set of applications; Decision 4 adds the authoring reasoning record and rules out video; Decision 8 fixes `us-east-1`, United States only; Decision 10 makes tokens swappable at run time; Decision 11 records the recording route and its three cautions. |
| 2026-09-20 | The Admin screen can register an application and edit one already registered, minting a revision only when a connection detail actually changed. Asked for explicitly: a credential's value can now be set alongside it, encrypted before it is written. Decision 5 item 5 is amended for this, on the record — it moves slice 1 away from functional-spec §8 rather than toward it, the one place that is true. |
