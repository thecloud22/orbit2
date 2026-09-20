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
| `apps/api` | Six migrations. Immutability enforced by revoked privileges **and** a trigger, proved by a test that asserts the owner is refused too. Artefacts verified against their digest when served. |
| `apps/worker` | Claims a run with a lease, drives Chromium, records every attempt, event and screenshot. Consults no model, and cannot. |
| `apps/web` | The run page, reading real records. Status and outcome as two facts; only the technical one is coloured. |
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
capture starts after sign-in; a registered credential held **encrypted in the store**, written out
of band, decrypted only in the worker; provider and model chosen in an **environment file**.

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
| The surface interface | Claude | **A debt.** Decision 2 asks that execution sit behind an interface so a second surface is a new file rather than a rewrite. `execute.ts` imports Chromium directly, so the ten step kinds are surface-neutral by assertion rather than by construction. |
| The terminal path | Claude | Not built. `demo/terminal-portal` warns how: drive a real emulator, never decode the datastream, or a misreading on Orbit's side is cancelled by the same misreading in the fixture. |
| The locator ladder, from measurement | Claude | **In progress.** Being measured against `demo/legacy-portal` — which strategies resolve to exactly one thing, and which shapes nothing reaches. |

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
| 2026-09-20 | Decision 13 recorded (a judged step). Amendments: Decision 5 takes a set of applications; Decision 4 adds the authoring reasoning record and rules out video; Decision 8 fixes `us-east-1`, United States only; Decision 10 makes tokens swappable at run time; Decision 11 records the recording route and its three cautions. |
