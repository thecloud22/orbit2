# Orbit 2.0 — Architecture decisions

This file is the record required by `docs/engineering/engineering-instructions.md` ("the architecture decisions, with
reasoning") and by `docs/slice-1-brief.md` ("Before any code: close the decisions the
specification leaves open"). It records what was decided, what else was viable, and why the
alternative was not taken.

Decisions 1–5 are the five the slice brief names. Decision 6 was settled before them; its text is
preserved below. Decisions 7 to 12 were added afterwards, as the operating constraints below were
fixed and as the applications this has to work against became clear.

Every decision records the same five things: the requirement that governs it, quoted; the options
considered; the trade-off between them; what was chosen; and how it is tested. Where a requirement
rules an option out, the requirement is quoted rather than paraphrased. Where nothing in the
specification forced a choice, that is said plainly instead of being dressed up.

| # | Decision | Status |
|---|---|---|
| 1 | [Identity](#decision-1--identity) | **Deferred past slice 1**, cost accepted and recorded |
| 2 | [Execution model](#decision-2--execution-model) | Adopted |
| 3 | [Persistence and immutability](#decision-3--persistence-and-immutability) | Adopted; tamper-evidence deferred |
| 4 | [Evidence storage](#decision-4--evidence-storage) | Adopted |
| 5 | [What a registered application is](#decision-5--what-a-registered-application-is) | Adopted |
| 6 | [Where a model may drive a browser](#decision-6--where-a-model-may-drive-a-browser) | Adopted, before 1–5 |
| 7 | [Which model, and where it runs](#decision-7--which-model-and-where-it-runs) | Adopted |
| 8 | [Where this runs](#decision-8--where-this-runs) | Adopted |
| 9 | [Backend stack](#decision-9--backend-stack) | Adopted |
| 10 | [Frontend stack and design system](#decision-10--frontend-stack-and-design-system) | Adopted |
| 11 | [How a workflow is authored](#decision-11--how-a-workflow-is-authored) | Adopted |
| 12 | [Resolution at the publish gate is exact](#decision-12--resolution-at-the-publish-gate-is-exact) | Adopted |
| 13 | [A judged step, and what holds it](#decision-13--a-judged-step-and-what-holds-it) | Shape adopted; **not built in slice 1** |

## How these were judged

Each option below was weighed against **§4 (workflow lifecycle), §10 (testing, debugging and
execution) and §12 (governance, compliance and auditability)** of
`docs/orbit-2.0-functional-specification.md`, and against nothing else. Not against what is
customary, not against what is quickest to stand up, and not against what a similar product would
do. Where a requirement eliminates an option the requirement is quoted verbatim; where an option
is merely more expensive or less convenient, that is said plainly and is not dressed up as a
prohibition.

Decision 5 is the exception worth naming: the object it defines is described in §7 and §8, so
those sections supply *what the object must contain*. §4, §10 and §12 still supply the test, and
they turn out to be decisive — see [Decision 5](#decision-5--what-a-registered-application-is).

Two phrases recur and mean something specific:

- **Structural** — the wrong thing cannot be expressed, not merely that no code currently does it.
  A rule enforced by a code review or a convention is not structural.
- **Ruled out** — a requirement in §4, §10 or §12 makes the option non-compliant, not unattractive.

## The operating constraints these were closed under

Some of what follows was not chosen by weighing §4, §10 and §12; it was given. It is recorded
here so that a reader can tell an engineering conclusion from a standing constraint, and so that
a later change to a constraint is recognised as reopening a decision rather than as a detail.

| Constraint | Settles |
|---|---|
| No identity provider. | [Decision 1](#decision-1--identity) — and it was the analysis's own conclusion, not only a constraint. |
| Identity and roles are implemented later, not in slice 1. | [Decision 1](#decision-1--identity), which is therefore a deferral with a stated price rather than an adoption. |
| PostgreSQL, an instance already running locally. | [Decision 3](#decision-3--persistence-and-immutability) item 7, which had reached the same engine from the enforcement requirement. |
| Artefacts on local disk for now. | [Decision 4](#decision-4--evidence-storage), which had already recommended it for slice 1. |
| Core functionality first. | [Decision 3](#decision-3--persistence-and-immutability) item 4 — the tamper-evidence chain is deferred and its columns reserved. |
| OpenAI locally now; routed through Bedrock later. | [Decision 7](#decision-7--which-model-and-where-it-runs). |
| Production is an AWS stack on Bedrock AgentCore. | [Decision 8](#decision-8--where-this-runs). |
| No practice/live distinction. One registered application has one set of hosts. | [Decision 5](#decision-5--what-a-registered-application-is) item 6, and an amendment to [Decision 6](#amendment-to-decision-6-the-practicelive-distinction-is-removed). |
| The interface is built to a production standard, not a prototype standard. | [Decision 10](#decision-10--frontend-stack-and-design-system). |
| TypeScript and Node. | [Decision 9](#decision-9--backend-stack). |
| React, headless primitives, our own design tokens. | [Decision 10](#decision-10--frontend-stack-and-design-system). |
| The applications are legacy: server-rendered, jQuery-era, framesets, fronted by WebSEAL. | [Decision 11](#decision-11--how-a-workflow-is-authored) and [Decision 12](#decision-12--resolution-at-the-publish-gate-is-exact) — the constraint that ruled out deterministic name matching. |
| Resolution is exact. Ambiguity is a refusal, not a tie to be broken. | [Decision 12](#decision-12--resolution-at-the-publish-gate-is-exact). |
| The deployment is United States only. | [Decision 8](#decision-8--where-this-runs) — `us-east-1`. |
| Customers may ask for their own branding. | [Decision 10](#decision-10--frontend-stack-and-design-system) item 1 — tokens resolved per workspace at run time. |
| A step will eventually need a model to judge something. | [Decision 13](#decision-13--a-judged-step-and-what-holds-it), whose shape is fixed now and built later. |

Three of these confirmed a conclusion the requirements had already reached, which is worth saying
plainly: PostgreSQL, local artefact storage and no identity provider were recommended before they
were specified. One of them — deferring identity — goes against both the slice brief and the
recommendation in Decision 1, and is recorded as such there.

---

## Decision 1 — Identity

**Status:** adopted.
**Settles:** how an actor is established by the platform rather than supplied by the caller.

### The requirement

> Each entry records the actor, the time, the object, what changed, and the reason where one was
> required. **The actor is established by the platform, never supplied by the caller.** (§12)

> Creating, editing, publishing, activating, pausing, archiving and restoring are each audited
> with the actor, the time and the affected version. (§4)

> **Publisher**: attribution recorded on the version itself, so the approval is answerable later.
> (§4, Figure 11)

> Every route produces a run that is indistinguishable in its evidence except for the recorded
> trigger and the actor that caused it. (§10)

And the sentence the whole of §12 exists to make true:

> …for any completed piece of work, a person who was not present can establish what was done, by
> which version, **on whose authority**, what the agent saw at each step, what it concluded, and
> what it could not have done. (§12)

### The options

**Option A — defer identity; every act is recorded against one implicit system actor.**

The cheapest thing available, and the one the slice brief explicitly warns against. It is not
ruled out by the letter of "never supplied by the caller" — a hardcoded actor is, technically,
established by the platform — but it is ruled out by what the record is for. With one actor,
"on whose authority" has no answer, and §10's *indistinguishable except for … the actor that
caused it* distinguishes nothing. The cost of reversing it is set out below; it is the reason this
option is rejected rather than merely disfavoured.

**Option B — a platform-owned actor record, with authentication as a replaceable boundary.**

Orbit holds its own `actor` table: an identifier, a kind, a display name, a creation time. Rows
are never deleted and never renamed in place. Authentication is a separate concern that happens at
the HTTP boundary and resolves to exactly one actor row; for slice 1 it is a single local sign-in
mechanism, and an external identity provider can be added later without the actor record changing.
The resolved actor is a value that only the boundary module can construct, and it is threaded
through every command as an argument.

**Option C — federated identity only; the actor is the identity provider's subject claim.**

No local actor record. Every audit entry stores the issuer and subject from the token.

Ruled out. §12 requires the history to be readable by someone who was not present, at any
distance in time:

> The audit history is **append-only and tamper-evident**, and each entry is linked to the run and
> step it concerns where applicable. (§12)

A subject claim is a foreign key into a system Orbit does not control and cannot hold to
append-only. When a person is deleted at the provider, or the provider is replaced, or the subject
is reissued, the history keeps a string that no longer resolves to anybody — and it cannot be
repaired, because repairing it would be an edit to an append-only history. Federation is an
authentication method. It is not an actor record, and it cannot be made into one.

### The trade-off

Between B and C: whether Orbit owns the durable fact of who someone is, or borrows it. Borrowing
is less to build and is correct for *authentication* — but §12's guarantee is about the record,
and a record whose subject can dissolve is not the guarantee. B costs one table and one boundary
module more than C, and is the only one of the three that answers "on whose authority" in five
years.

### Decision

**Option A — identity is deferred past slice 1 in full.** No identity provider, no sign-in, no
roles, and no actor record: no `actor` table, no actor columns, no actor argument. This was taken
as a scope decision with the cost below in view.

It contradicts `docs/slice-1-brief.md`, which excludes roles but explicitly not identity — *"§2 —
but **not** identity itself"* — and names it "the one to resist deferring". The brief is not
edited to agree; the contradiction is recorded here, which is the only honest place for it. The
brief describes what slice 1 should contain, this file records what was decided, and where they
differ a reader should be able to see both.

**Option B is not withdrawn — it is postponed.** When identity is built it is built as Option B: a
platform-owned actor record with authentication as a replaceable boundary, never a provider's
subject claim, for the reasons Option C was ruled out on. What is deferred is when, not what.

While it is deferred, five rules keep the deferral from becoming something worse than absence:

1. **Nothing fakes attribution.** No placeholder actor, no constant in a `created_by` column, no
   `"system"` string standing in for a person. §12's guarantee is that a reader can establish *on
   whose authority* something was done; a record that names nobody leaves that unanswered, which
   is honest, and a record that names a constant answers it wrongly, which is worse than an
   unanswered question in an append-only history that cannot later be corrected.
2. **The product says attribution is not kept yet**, wherever an audit history or a published
   version is shown. §3's rule that an empty screen never reports a failure applies to a missing
   fact as much as to a missing row: *not recorded* and *recorded as nobody* are different, and
   the reader is told which one they are looking at.
3. **Acceptance criterion 14 is not met**, and is carried in `docs/ACTIVE_TASK.md` as outstanding
   rather than reinterpreted into something slice 1 does satisfy. It reads "attributed to an actor
   established by the platform", and no reading of that is satisfied by a system with no actors.
   The same applies to §12's *tamper-evident* — see
   [Decision 3](#decision-3--persistence-and-immutability) item 4.
4. **No command accepts an actor identifier from a caller in the meantime.** Commands take
   `(validatedInput)` and nothing else. This costs nothing today and it matters later: it keeps
   the eventual retrofit from beginning in the one shape §12 names — *"never supplied by the
   caller"* — because there is no existing parameter to be tempted to reuse.
5. **The audit history is still written**: append-only, recording the act, the time, the object
   and what changed. Everything except who. When identity arrives it adds a column to a history
   that already exists, rather than a history to a product that has none.

### The cost this defers, and who pays it

The slice brief says identity is the one to resist deferring. This is the bill the deferral
accepts, itemised — not as an argument against a decision already taken, but so that it is a known
cost rather than a discovered one, and so that whoever inherits it can see what it buys and what
it forecloses.

**1. The gap in the audit history is permanent, by the operation of the requirement being
satisfied.**

> The audit history is **append-only and tamper-evident** … (§12)

Append-only means there is no supported operation that changes a past entry. So every act
performed before identity exists is unattributable *forever*: you cannot backfill, because
backfilling is the exact mutation the requirement forbids, and a tamper-evident history that has
been rewritten to look complete is worse than one with an honest hole. The only compliant remedy
is to say "attribution begins on date X", in the product, permanently.

**2. Every version published before identity has no publisher, and cannot acquire one.**

> Publishing mints a new immutable version. It is never an edit of an existing one. (§4)

> **Publisher**: attribution recorded on the version itself, so the approval is answerable later.
> (§4)

A version is immutable, so the publisher field cannot be filled in afterwards. The only way to
get a version with a publisher is to publish a new one — which mints a *different* version with a
*different* identity, while every run that already executed the old one keeps naming it (§4:
"Every run references the exact version it executed"). The unattributable version stays in the
record, named by runs, forever. Each day of deferral adds versions to that set.

**3. The retrofit lands in exactly the shape §12 forbids.**

When identity arrives late, the call sites already exist without it. The cheap repair — and it is
much cheaper than the alternative — is to pass an actor identifier into the functions that need
one. That is caller-supplied identity, which is precisely:

> The actor is established by the platform, **never supplied by the caller**. (§12)

The compliant repair instead changes the signature of every command, every persistence write and
every event constructor, in one sweep, with no behavioural tests to protect it — because the tests
were also written without an actor. Doing it now costs the same edits across roughly a dozen call
sites instead of across the whole service layer, and each one is written correctly the first time
rather than corrected.

**4. Artefact access recording starts empty too.**

> Every access to an artefact is itself recorded. (§2)

Without an actor there is nothing to record, so this history begins on the day identity does,
with the same permanent hole as the audit history.

**5. The specification already contains the receipts.**

Three of §2's and §12's required screenshots could not be captured from the inspected environment,
each for the same reason:

> Capture was not possible because the inspected environment **has no identity**, so actions are
> not attributable to a named person, and it holds no retention policy or cross-version comparison
> to display. (§12)

This is not a predicted cost. It is an observed one, from the product this specification was
written about.

**For comparison, what it would have cost to do now:** one table, one migration, one branded type,
and an extra argument on commands that do not yet exist. No roles, no permission matrix, no
delegation, no provider integration.

**What keeps the bill from growing.** Items 1–5 above are the whole of it. The bill is charged per
*attributable act that happens without an actor* — every version published, every run started,
every audit entry written between now and the day identity lands. It grows with use, not with
time, so a slice 1 that is developed and demonstrated rather than operated pays very little, and a
slice 1 that quietly becomes the environment people work in pays a great deal. The decision to
defer is sound while the first is true. **The moment real procedures are published by real people
in this system, the deferral has stopped being cheap** — that, rather than a date, is the trigger
to build it.

### How this is tested

- No request can cause an actor identifier to be persisted: inbound validation rejects unknown
  keys, so a body carrying `actor`, `actor_id` or `created_by` is refused rather than ignored.
- The audit history records the act, the time, the object and what changed for every act §4 names,
  and is queryable in order — the whole of criterion 14 except its attribution clause.
- Every surface that displays an audit entry or a published version states that attribution is not
  yet recorded, and no surface shows a fabricated or constant actor.
- Acceptance criterion 14 is asserted as **pending** by a test that is present and skipped with a
  reason naming this decision, so that it surfaces on every run rather than being remembered.

---

## Decision 2 — Execution model

**Status:** adopted.
**Settles:** where work runs, how it survives a restart, and how a run in progress is reconciled
after an interruption.

### The requirement

> A run interrupted by a platform restart is **reconciled** on recovery: it is either resumed or
> failed with a typed error and an event, never left indefinitely in an unresolved state. (§10)

> An operator can **cancel** a queued or running run. Cancellation is cooperative: the run stops
> at the next safe boundary rather than mid-action, and records who cancelled it and what had
> completed. (§10)

> An operator can **pause** and **resume** a run where the workflow declares it safe, and a paused
> run survives a restart of the platform. (§10)

> Orbit exposes **queue state**: what is waiting, what is executing, how long work has been
> waiting, and what is delayed beyond its expected start. (§10)

> Every run persists enough to reconstruct what happened from stored records alone, without
> re-running anything. (§10)

### The options

**Option A — run in the request process: the run starts when the request arrives and proceeds in
the web server.**

Ruled out twice.

First, §10's status vocabulary contains a state this model cannot produce:

> **Queued** | The run has been created and is waiting to start. | Cancel it before it starts.
> (§10)

A run that begins on arrival is never queued, so the status can never be displayed truthfully, and
the operator action attached to it — cancel before it starts — does not exist. §10 also requires
Orbit to expose *what is waiting … and what is delayed beyond its expected start*, which is a
property of a queue that this design has not got.

Second, there is nothing to do the reconciling. §10 requires an interrupted run to be *either
resumed or failed with a typed error and an event* — a sweep over runs that no longer have a live
executor. With execution inside the request that served it, the interrupted run's only witness
died with it.

**Option B — a durable step journal in the transactional store, advanced by a worker that leases
runs from it.**

A run is a state machine whose only unit of progress is a **step attempt**. Before a step attempt
touches anything, an `attempt started` record is committed; after it finishes, an `attempt ended`
record with its outcome is committed. A worker process claims a queued run by taking a lease with
an expiry; a reconciler sweeps runs that are in a non-terminal state with a dead lease and
resolves each one. Execution sits behind a `StepExecutor` interface, as `docs/engineering/engineering-instructions.md`
requires ("The layer that executes must sit behind an interface, so a second surface can be added
without reopening the first").

**Option C — an external durable workflow engine (Temporal, Restate, Inngest or equivalent).**

Durability, retry and resumption come from the engine. Orbit's code describes the run as a
workflow function; the engine replays it after an interruption.

Ruled out — though it is the option most likely to be reached for, which is why it needs a reason
and not a preference. The engine keeps the authoritative history of what the run did, and §10 says
where that history has to live:

> Every run persists enough to reconstruct what happened from stored records alone, **without
> re-running anything**. (§10)

An engine's durable history is a replay log: it reconstructs by re-executing the workflow function
against recorded results. That is the operation §10 names and excludes. Orbit would therefore have
to write its own complete record *as well*, at which point two systems hold an account of the same
run and can disagree — the failure mode §4 rejects for status in almost these words: "computed
from the facts the system already holds … and never stored separately, **so it cannot disagree
with them**".

§12 compounds it: the audit history must be *a single, searchable* history, *append-only and
tamper-evident*, and *each entry linked to the run and step it concerns*. A history split across
Orbit's store and an engine's retention-limited internal log is neither single nor append-only in
Orbit's control.

And the engine buys less than it appears to. §10's cancellation stops *at the next safe boundary*
and pause is permitted only *where the workflow declares it safe* — both are properties of the
published artefact's step boundaries, which Orbit must own and interpret either way.

### The trade-off

B is more code than C — a lease, a sweeper, a state machine — and that code is load-bearing, so it
has to be right. What B buys is that the run's record and the run's mechanism are the same thing:
there is no second account to reconcile, and reconstruction reads rows rather than replaying
anything. Given that §10 already demands a complete durable record independently of how execution
is driven, B is writing that record *once*, and C is writing it twice.

### Decision

**Option B.** Specifically:

1. **The step attempt is the safe boundary.** Cancel and pause take effect between attempts, never
   inside one. This is the concrete meaning of §10's "next safe boundary rather than mid-action".
2. **Write before acting, write after acting.** An attempt that started and never ended is exactly
   the interrupted case, and it is discoverable by a query rather than by inference.
3. **Leases, not just start-up recovery.** The run row carries the worker that claimed it and a
   lease expiry. The reconciler runs on start-up *and* on a timer, because a crashed or partitioned
   worker is an interruption that no restart announces. §10 says a run is *never left indefinitely
   in an unresolved state*; only a timer makes that true of a worker that died without the platform
   restarting.
4. **Reconciliation is decided by the step kind, and defaults to halting.** An interrupted attempt
   at a step declared replayable — navigation, extraction, assertion, anything that reads — becomes
   a fresh attempt, matching §10: "Resuming replays what can be safely repeated and records a second
   attempt rather than rewriting the first." An interrupted attempt at a step that may have changed
   something is **failed with a typed error and an event**, never retried. Guessing that a
   half-finished action did not land is the behaviour `docs/engineering/engineering-instructions.md` rule 2 exists to forbid,
   and §10 explicitly permits failing with a typed error as a compliant resolution.
5. **Browser sessions are not durable, and nothing pretends otherwise.** A resumed run opens a new
   session and re-establishes position by replaying the replayable prefix; where the prefix is not
   wholly replayable, the run fails with a typed error naming the step. This discharges the open
   item left by [Decision 6](#decision-6--where-a-model-may-drive-a-browser): "Browser sessions are
   stateful, expire, and do not survive a restart. Decide what happens to an authoring session when
   the process stops, and say so."
6. **The reconciler's acts are recorded as its own**, distinguishable from an operator's, even
   though [Decision 1](#decision-1--identity) defers the actor record. A run failed by
   reconciliation and a run cancelled by a person must not read alike — so the *event kind*
   carries that difference now, and the actor column carries it when identity arrives. This is
   the one place the deferral would otherwise corrupt a fact rather than merely omit one.
7. **Partial completion is a recorded outcome, not an inference.** §10: "Where a run completes part
   of its work and cannot complete the rest, Orbit reports **partial completion** explicitly,
   naming what was and was not done …" The step journal is what makes that sentence answerable
   without interpretation.
8. **Deployment for slice 1:** one worker process beside the web process, against the same store.
   Nothing in §4, §10 or §12 requires more than one worker; the lease exists so that a second is
   a deployment change rather than a redesign.
9. **The production target does not move the journal.** Production is an AWS stack on Bedrock
   AgentCore ([Decision 8](#decision-8--where-this-runs)). AgentCore Runtime is somewhere a worker
   can execute; it is not where the run's record lives. §10's *"reconstruct what happened from
   stored records alone, without re-running anything"* keeps the journal in Orbit's own store
   wherever the worker happens to run — which is the same reason Option C was ruled out, applied
   to a hosting choice instead of an engine.

### How this is tested

- A run killed mid-attempt is, after the reconciler runs, either running again with attempt 2
  recorded or failed with a typed error — and in both cases an event says which and why. Never
  still "running".
- A paused run survives a process restart and resumes at the step after the last completed one.
- Cancelling a running run stops it at a step boundary, records the cancelling actor, and retains
  every artefact captured before the stop (acceptance criterion 8).
- The queue view distinguishes waiting from executing, and reports waiting time.

---

## Decision 3 — Persistence and immutability

**Status:** adopted.
**Settles:** how a published version is made immutable in fact rather than by convention, and how
an append-only audit history is enforced.

### The requirement

> Publishing mints a new immutable version. It is never an edit of an existing one. Archiving
> retires an agent's identity and never deletes or alters a version. Every run references the exact
> version it executed, so the question "what did this run actually do" is answerable from stored
> records at any distance in time, including for versions no longer in use. (§4)

> The audit history is **append-only and tamper-evident**, and each entry is linked to the run and
> step it concerns where applicable. (§12)

> **Platform administrator** … *Cannot*: Alter a published version, alter or delete recorded
> evidence, or reveal a stored secret value. (§2)

> Orbit displays one derived status per workflow … computed from the facts the system already
> holds … and never stored separately, so it cannot disagree with them. (§4)

### The options

**Option A — immutability by application discipline: the code simply never issues an update.**

Ruled out. §12 asks for two distinct properties and this supplies neither structurally:

> The audit history is **append-only and tamper-evident** … (§12)

*Tamper-evident* is a detection property — it asserts that alteration can be *noticed*, not merely
that the application does not intend it. Application discipline offers no evidence to a reader who
was not present, which is the only reader §12 is written for. It also cannot express §2's
restriction on the platform administrator, who by definition has the application's full surface.

**Option B — the store enforces it: append-only tables with the application's privileges revoked.**

Immutable tables (`workflow_version`, `audit_entry`, `run_event`, `artefact`) grant the
application's role `INSERT` and `SELECT` only; `UPDATE` and `DELETE` are revoked, and triggers
raise on both so that a future grant does not silently reopen the door. The version's executable
body is serialised canonically and hashed, and the digest is part of the version's identity.

**Option C — Option B plus a hash chain over the immutable records.**

Each audit entry stores the digest of its predecessor in its scope, so any alteration or removal
breaks the chain at a detectable point. The version's content digest anchors the version records
into the same scheme.

### The trade-off

B *prevents* alteration through the application; C *detects* alteration however it was made. §12
asks for both words — "append-only **and** tamper-evident" — so B alone answers half the sentence.
C costs a serialised write per scope and a verification pass, and it is honest about its limit: a
hash chain with no external anchor detects a localised edit, not an adversary who can rewrite the
whole chain. That residual is worth stating rather than hiding, and it is closed later by
publishing periodic checkpoints — additive, if the checkpoint column exists now.

### Decision

**Option C (which subsumes B).** Specifically:

1. **Three objects, never collapsed** (`docs/engineering/engineering-instructions.md`): `workflow` is the mutable business
   procedure; `workflow_version` is the immutable executable artefact minted by publication;
   `run` is the record of one execution. A version is not a row of the workflow with a flag on it.
2. **Privileges, not just triggers.** The application connects with a role that holds no `UPDATE`
   or `DELETE` on immutable tables. Triggers are the second lock, not the only one — a trigger can
   be disabled by whoever can also grant privileges, so neither alone is the answer.
3. **Canonical serialisation and a content digest** on every version, so "this version is
   unaltered" is checkable and not merely asserted, and so two versions can be compared by identity.
4. **A hash chain per workspace** over the audit history — **deferred past slice 1**, with its
   columns reserved and unwritten. Item 2 is the preventing half and is cheap, structural and
   ships now; the chain is the detecting half, and it is worth little while the history it would
   protect records no actor ([Decision 1](#decision-1--identity)) — tamper-evidence over entries
   that name nobody proves that an unattributed record was not altered. Until it is built, §12's
   *"append-only **and** tamper-evident"* is **half satisfied**, and that is carried as
   outstanding rather than claimed. Sequencing per workspace, when built, bounds write contention;
   a global chain would serialise every act in the product behind one row.
5. **Status is derived, never stored, for workflows** — §4 requires it, and the derivation is a
   pure function of facts the store already holds. For a **run**, the append-only event stream is
   authoritative and the status column is a projection written in the same transaction; a
   projection that can be rebuilt from its source is not a second source of truth.
6. **Retirement is a status; deletion is not available.** Archiving a workflow, retiring an
   application and deactivating an actor are all status transitions. §12's retention regime, when
   it arrives, "records each expiry as an audited event rather than deleting silently" — the schema
   should never acquire a delete path that retention would later have to be bolted onto.
7. **The store is PostgreSQL** — reached from the enforcement requirement, and independently
   given as a constraint. This follows from the requirement rather than from preference: the design needs per-table privilege revocation against the application's own role
   (item 2), transactional writes spanning the run journal, the audit chain and artefact metadata,
   and a claimable lease queue for [Decision 2](#decision-2--execution-model). SQLite is ruled out
   on the first of those — it has no role system, so "the application may insert and never update"
   cannot be expressed, and immutability falls back to exactly the convention Option A was rejected
   for. Slice 1 uses the local instance already running; production is the same engine on AWS
   ([Decision 8](#decision-8--where-this-runs)), so the grants and triggers move unchanged.
8. **A migration for every schema change**, per `docs/engineering/engineering-instructions.md`, including the grants and the
   triggers — an immutability guarantee that lives outside version control is not a guarantee.

### How this is tested

- An `UPDATE` or `DELETE` against `workflow_version` or `audit_entry` as the application role
  fails, and the test asserts the failure rather than the absence of a code path.
- Acceptance criterion 5: editing a workflow after publication leaves the published version's
  content digest unchanged, and a run of it continues to name that version.
- Altering one audit entry's payload out of band breaks chain verification at that entry and
  nowhere earlier.
- A workflow's derived status is computed identically on the review page, in the list and in the
  API, because all three call the same function over the same facts.

---

## Decision 4 — Evidence storage

**Status:** adopted.
**Settles:** where artefacts live, how integrity digests are produced and checked, and how
redaction happens before an artefact is stored.

### The requirement

> Every artefact carries its size, type and an integrity digest. Orbit verifies an artefact against
> its digest when serving it, and reports a mismatch as an integrity failure rather than serving
> content that may have changed. (§12)

> Orbit applies redaction **before an artefact is stored, not after**: values supplied as secrets,
> fields declared as sensitive, and headers named as confidential are removed from screenshots,
> page snapshots, interaction traces, service exchange records, events and logs. **Where a value
> cannot be redacted with confidence, the artefact is withheld and the run records that it was
> withheld and why** — an unreadable artefact is recoverable, and a leaked credential is not. (§12)

> A full interaction trace | The whole session, for every run, always. (§10)

> Every run persists enough to reconstruct what happened from stored records alone, without
> re-running anything. (§10)

### The options

**Option A — artefacts as blobs in the transactional store.**

Not ruled out by §4, §10 or §12 — that should be said plainly rather than manufactured. It is
excluded by `docs/engineering/engineering-instructions.md`'s architecture rule ("Binary artefacts are stored outside the
transactional store; their metadata and links inside it"), and it sits badly with §12's retention
regime, which will eventually expire evidence out of a store this design is otherwise holding
append-only.

**Option B — S3-compatible object storage, content-addressed, with metadata rows in the store.**

The artefact's key is its digest, so a stored object and its identity cannot drift apart. Slice 1
would run MinIO or an equivalent locally.

**Option C — a content-addressed store on the local filesystem, behind the same interface as B.**

Identical properties for one registered application; a different driver.

### The trade-off

B and C satisfy §12 identically, because the requirement is about digests and verification, not
about where bytes sit. B is the right answer once evidence outlives a single host; C is the right
answer for slice 1 and costs a driver swap later, given that the store is reached only through an
`ArtefactStore` interface.

**The choice that actually matters here is not the store. It is the capture path**, because §12's
redaction requirement is a property of how an artefact comes into existence, and no storage backend
supplies it.

### Decision

**Option C now, behind Option B's interface** — artefacts on local disk for slice 1, which is
also what was specified. Production is AWS ([Decision 8](#decision-8--where-this-runs)), where the
same interface takes an S3 driver and the content-addressed layout carries over unchanged, because
the key is the digest and the digest does not depend on where the bytes sit.

And, more importantly, the capture path:

1. **One way in.** Artefacts enter only through a `capture()` function that takes the raw bytes
   *and* the run's redaction set. The store's `put` is not exported. There is no second route by
   which unredacted bytes could reach storage.
2. **Order is fixed: redact → digest → store → record metadata.** The digest is taken over the
   redacted bytes, because those are the artefact. Nothing unredacted is ever written to disk,
   including to a temporary file — "before an artefact is stored, not after" admits no staging step.
3. **Withholding is a first-class record, not an error.** A `withheld` artefact row carries the
   step, the kind of artefact, and the reason. It appears in the run's evidence as a withheld
   artefact with its reason, which is what §12 asks for. A run with a withheld screenshot is not a
   degraded run.
4. **Screenshots are masked at capture, and withheld when masking cannot be trusted.** Pixels
   cannot be redacted with confidence after the fact. Declared-sensitive controls are masked in the
   page before the screenshot is taken; where a secret value was entered into a control whose
   location Orbit cannot confirm was masked, the screenshot is **withheld with that reason**. This
   is the direct reading of "where a value cannot be redacted with confidence, the artefact is
   withheld", and it is a real behavioural consequence, not a caveat.
5. **Text artefacts are redacted by exact value, by declared sensitive field, and by named header.**
   A secret whose value is too short or too common for substring matching to be trustworthy — a
   four-digit code, say — cannot be redacted with confidence, so the artefact is withheld rather
   than best-guessed.
6. **Orbit builds its own interaction trace; it does not adopt the driver's.** §10 requires a full
   interaction trace for every run, always. A browser driver's native trace is written to a file by
   the driver, with embedded screenshots and network bodies, before Orbit can touch it — which is
   the one thing §12 forbids. Orbit's trace is therefore assembled from its own structured events
   and its own captured, already-redacted snapshots. This is a deliberate cost: the native trace
   viewer is not available, and the requirement is met instead of the convenience.
7. **The redaction set lives in process memory and dies with the run.** It must contain the secret
   values in order to remove them, and it must never be persisted — §2: "A value supplied as a
   secret at run time is required afresh on every run, is never stored, and never appears in a run's
   inputs, outputs, logs, events or captured evidence." It is held by the worker for the life of the
   run and is not written anywhere, including to the run's own record.
8. **Verification on every read, with a typed failure.** Serving an artefact re-hashes it and
   compares against the recorded digest. A mismatch returns a typed `integrity_failure` naming the
   artefact — never the content, and never a generic error (acceptance criterion 10).
9. **Artefact access is recorded** (§2), against the actor from
   [Decision 1](#decision-1--identity), from the first day rather than when roles arrive.
10. **Model call records are evidence too.** §12 requires that, where a model was involved in
    authoring, "every call is recorded with what it was asked, what it returned, what it cost, and
    what it was looking at — **including calls that produced nothing usable**". These go through the
    same capture path and the same redaction, which is what
    [Decision 6](#decision-6--where-a-model-may-drive-a-browser) means by "capture is not optional".
    The record names the provider and model that served the call, so a workflow authored against
    one provider stays readable after the routing changes — see
    [Decision 7](#decision-7--which-model-and-where-it-runs).
11. **The authoring reasoning record is evidence, and is text.** §12 requires every model call to
    be recorded "with what it was asked, what it returned, what it cost, and what it was looking
    at — including calls that produced nothing usable". That record answers the question a
    reviewer actually has, which is not *what did the screen look like* but *why does the workflow
    say this*. Each turn keeps: what the model was shown (the page as structure), the instruction
    it was working on, what it proposed and its stated reason, **Orbit's verdict on the proposal
    and why**, the model, the tokens and the cost. Turns whose output failed validation are kept
    in place, in order, metered — a record that drops its own failures is not a record.
12. **Screenshots, never video.** An authoring session is evidenced by a screenshot at each
    material action plus the reasoning record above. Orbit does not capture video, and does not
    adopt a driver's or a platform's session recording. Three reasons, in order of weight: a video
    is written continuously to disk by the driver, so it cannot be redacted *before* it is stored
    (§12, and the same objection as item 6); frames are not searchable, diffable or citable, so
    they answer no question the reasoning record does not answer better; and a few minutes of
    frames per session, kept as evidence, would dominate storage and make §12's retention regime
    urgent for no gain.

### How this is tested

- Acceptance criterion 11: a run given a secret produces no artefact, event, log line, input or
  output containing its value — asserted by scanning every artefact the run produced, not by
  inspecting the code that redacts.
- A run where a secret is entered into an unmaskable control produces a withheld screenshot with a
  reason, and the run is not failed by it.
- Corrupting a stored artefact's bytes makes serving it report an integrity failure; the bytes are
  never returned.
- An artefact's digest is stable across a restart, and the run page shows size, type and digest.

---

## Decision 5 — What a registered application is

**Status:** adopted.
**Settles:** the unit a workflow is attached to — its surface, its hosts, its credential
reference — and how a published version's reach is fixed.

§7 and §8 describe what this object contains. §4, §10 and §12 decide its shape, and they are
decisive.

### The requirement

> **Environment separation** is enforced: practice and live are distinct, a version is promoted
> between them by an approved act, and every run records which environment it executed against.
> (§12)

> …a person who was not present can establish what was done, by which version, on whose authority,
> what the agent saw at each step, what it concluded, and **what it could not have done**. (§12)

> Publishing mints a new immutable version. It is never an edit of an existing one. (§4)

> A **test run** is marked as such throughout, executes against the practice copy, and is excluded
> from operational success metrics. (§10)

And from the sections that describe the object itself:

> …the hosts it declares become the only hosts a published version is permitted to reach. (§8)

> A designer therefore never chooses a "browser step" or a "terminal step" — they describe the
> work, attach the workflow to the application, and Orbit carries the work out on that
> application's surface. (§7)

### The options

**Option A — a mutable registry row; the published version holds its identifier.**

Ruled out, and this is the decision's whole point. The registry row carries the host allowlist,
which is the set of places a version may reach. If the version holds only a pointer, then an
administrator editing a row changes what a live, immutable version is permitted to do — with no
publication, no approval and no version history. That contradicts two requirements at once:

> Publishing mints a new immutable version. It is never an edit of an existing one. (§4)

> …and **what it could not have done**. (§12)

"What it could not have done" is not answerable about a past run if the boundary it was subject to
is a row that has since been edited. §4 also states the governing principle directly: "no automated
part of Orbit may move a workflow closer to being live" — and an administrator's registry edit
silently widening a live agent's reach is worse than automatic, because nobody performed an act
that looks like a change to that agent at all.

**Option B — the registry entry is versioned; a published workflow version pins an application
revision.**

Editing an application mints a new application revision. Published versions stay pinned to the
revision they were published against. Changing what a live agent may reach requires republishing,
which is a human act with a publisher recorded.

**Option C — the application definition is copied into the version body at publication.**

The version is wholly self-contained: surface, host lists and credential name are inside the
immutable, digested artefact.

### The trade-off

C gives the strongest reconstruction property — §10's "from stored records alone" needs no second
lookup, and the content digest from [Decision 3](#decision-3--persistence-and-immutability) covers
the allowlist, so what the version could reach is inside what was approved and hashed. But C alone
loses the stable object that §8's operational requirements need: connection health, credential
rotation "without editing those workflows", and retirement that "removes an application from
selection without disturbing workflows that already reference it or runs that already used it".
Those all require a living identity that outlives any one revision.

They are not alternatives. Each answers a different question, and the right answer takes both.

### Decision

**B and C together.** A registered application is three things, deliberately separated:

1. **An identity** — stable, referenced by workflows and runs, carrying the operational state that
   is *supposed* to change: health, whether the named credential is currently configured, owner,
   retired or not. None of this affects what a version may do.
2. **An append-only sequence of definition revisions** — surface, hosts, sign-in name, credential
   name. An administrator's edit mints a revision; it never alters one. §8 records practice hosts
   and live hosts as separate lists; slice 1 keeps **one list**, for the reason in item 6.
3. **A copy inside the published version.** Publication resolves the current revision, copies it
   into the version body, and records the revision reference alongside it. **The copy is what the
   run enforces.** The reference is what lets a reader see where it came from and whether the
   registry has since moved on.

With the consequences that follow:

4. **The allowlist is host *and path prefix*, checked by Orbit immediately before each navigation,
   against the copy in the version** — never handed to a driver's configuration and never handed to a model as an
   instruction. This is [Decision 6](#decision-6--where-a-model-may-drive-a-browser)'s constraint 2
   ("Enforce the address allowlist yourself") given a concrete home: the allowlist is a field of
   the immutable artefact, so it cannot drift from what was approved.
5. **The credential is referenced by name in both the revision and the copy, never by value.** §2:
   "Users select a credential *by name*; the value is resolved only at the moment it is used." This
   is also what makes §8's rotation requirement possible — rotation changes a value the product
   never held, so no version and no workflow is edited.
6. **There is no environment concept in slice 1.** A registered application has one set of hosts.
   No practice list, no live list, no promotion, no `environment` field on a run. This is a scope
   decision, taken to get one complete loop working end to end, and it is not a reinterpretation
   of §12 — the requirement stands and slice 1 does not meet it:

   > **Environment separation** is enforced: practice and live are distinct, a version is promoted
   > between them by an approved act, and every run records which environment it executed against.
   > (§12)

   Unmet, recorded in [What slice 1 will not satisfy](#what-slice-1-will-not-satisfy), and it
   comes back with roles.

   What makes this safe to defer is that the *boundary* was never the environment split. It is the
   host allowlist in item 4, which is checked before every navigation against the copy inside the
   published version. That check does not know or care whether a host is a practice copy; it knows
   only whether the version was approved to reach it. **Removing the environment concept removes a
   classification, not a control.**

   Two consequences to hold onto, because they are what the practice/live split was doing in
   passing:

   - **Whoever registers an application chooses what is behind it.** For slice 1, that should be a
     system whose data does not matter, because nothing in the product now distinguishes one from
     the other. This is a deployment discipline, and it is weaker than the structural guarantee it
     replaces. Saying so is the point of recording it.
   - **Nothing in slice 1 changes a system of record.** §7 already requires that, without granted
     authority, "a step that would change something is compiled into a hand-off to a person". That
     rule was always independent of environments, and with the environment split gone it is now
     the boundary that matters most. Slice 1's acceptance criteria are read-shaped — criterion 7
     is about correctly establishing that a record does not exist — so no step in slice 1 needs
     that authority, and none is granted.

   When environments return, they add a field to the definition revision and a field to the run.
   The shape of the copy-into-the-version does not change, which is why removing it now does not
   cost a migration later.
7. **Retirement never breaks the past.** Retiring an application removes it from selection and
   leaves every published version's copy, and every past run, exactly as it was — §8's stated
   behaviour, and the same rule as §4's archiving.
8. **A workflow names a set of applications, and a step names which one it uses.** §10 already
   anticipates this: *"Surface badge: shown only where a run actually spans more than one kind of
   system, so it carries information when present."* A procedure that reads a claim in one system
   and checks a payment in another is ordinary work, not an exotic case.

   **Slice 1 fills that set with exactly one.** The field is plural from the first migration
   because making it plural later is not a feature, it is a schema change that reaches four places
   at once: the workflow's attachment, each step's target, the several address lists copied into
   the published version, and the two or more credentials a single run resolves. Each of those is
   cheap to shape now and expensive to retrofit — the same argument as
   [Decision 1](#decision-1--identity), at a fraction of the size.

   The consequences that follow, and hold even with one entry:

   - **Each step records which application it ran against**, so a run's evidence answers "what did
     it touch, and when" without inference. The surface badge in the interface is that field.
   - **The allowlist is per application**, and the check before each navigation is against the list
     belonging to the application that step names — never a merged list, which would let a step
     reach a host approved for a different system.
   - **Credentials are resolved per application, at the moment each is used** (§2), so a run may
     hold two sign-ins and never holds either value.
9. **Steps do not name a surface.** §7 is explicit: a designer "never chooses a 'browser step' or a
   'terminal step'". So the step kinds in the closed set are business intent — navigate, enter,
   activate, read, assert, collect, decide, hand off — and the executor is selected from the
   application's surface at run time. A step kind that names a browser would make §7 unbuildable
   later and is not admitted now.

### How this is tested

- Editing a registered application after publication leaves the published version's content digest
  unchanged, and a run of that version reaches only the hosts recorded in its copy.
- A workflow attached to an application whose revision has advanced shows that its published
  version pins an earlier revision, and says so.
- A step attempting a host outside the version's copied allowlist halts with a typed error naming
  the host and the step — it does not navigate and then fail.
- A run reaching a host that is not in its version's copied list halts and names it, which is the
  only host boundary slice 1 has and is therefore tested as the load-bearing one.

---

## Decision 6 — Where a model may drive a browser

**Status:** adopted. Settled before decisions 1–5, and unchanged by them.
**Provenance:** the text below is the draft that `docs/engineering/engineering-instructions.md` refers to as
`decision-draft-model-driven-browser.md`, preserved word for word from its **Context** line
onwards. Two things were changed and nothing else: its heading levels, to nest it under this
decision, and its own status line — which read *"draft, for `docs/decisions.md` in the new
repository"* — replaced by the status above, since the file it was waiting for is this one.
Decisions 1–5 above were required to be consistent with it, not the other way round.

**Context:** the intention to use a model-driven browser tool (Playwright MCP or equivalent) for
the AI-driven flow.

### Decision

A model may drive a browser **while a person is authoring**. A model may not drive a browser
**while a published version is executing**.

### Why the line is there

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

### What this permits

- The authoring session opens the registered application's **practice copy** and a model works
  through the described procedure, looking at pages and deciding what to do.
- Every turn is captured as authoring provenance: what it did, why, what it was looking at, the
  page state at that moment, and what the turn cost (§5, §12).
- The session **emits a durable artefact** — the structured workflow. That artefact, not the
  session, is what a person reviews, confirms and publishes.
- Execution replays the artefact. No model is consulted.

### Constraints that come with it

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

### What would have to change if a model drove execution too

State this explicitly rather than discovering it later. Run-time model control would require
renegotiating: §4 (what immutability means when behaviour varies), §10 (what "reconstructable"
means when the path was chosen live), §12 (what was approved, if not the behaviour), and the
product overview's central claim. That is a different product with a different value proposition
— defensible, but it is not the one this specification describes, and the two cannot be held at
once.

### Amendment to Decision 6: the practice/live distinction is removed

The text above is preserved as it was decided, and this amendment sits beneath it rather than
inside it, so that both the original and the change are visible. The decision itself — *a model
may drive a browser while a person authors, never while a published version executes* — is
unchanged and is not up for renegotiation here.

**Constraint 1 no longer applies as written.** It reads:

> 1. **Practice copies only.** An authoring session never touches a live system. The registry
>    already separates practice hosts from live hosts (§8); enforce it at the point the session
>    opens a page.

Slice 1 has no practice/live separation to enforce
([Decision 5](#decision-5--what-a-registered-application-is) item 6), so there is nothing at the
point the session opens a page to check it against.

**Constraint 2 absorbs the job, and was always the stronger of the two.** It reads:

> 2. **Enforce the address allowlist yourself.** A browser tool will navigate anywhere it is asked
>    to. The permitted hosts are a property of the registered application, checked by Orbit before
>    the navigation happens — never a rule the model is asked to follow.

That is the real containment, and it does not depend on environments. A model driving a browser
is bounded by what Orbit permits it to open, not by what kind of copy sits behind the address.
Constraint 1 was a second, coarser fence around the same field.

**What is genuinely weaker, stated rather than glossed.** Constraint 1 guaranteed that an
authoring session could not touch a system of record *even if the allowlist were wrong*. That
belt-and-braces property is gone. From here, the allowlist is the only thing standing between a
model-driven session and whatever was registered — so the allowlist check is not a validation
nicety, it is the control, and it is tested as one. Constraint 1 returns unchanged when
environments do.

**Constraint 5 is amended.** It reads:

> 5. **Prefer structured page representations to screenshots** for what the model is shown:
>    cheaper, and it makes what the model saw reviewable as text. Keep screenshots as evidence for
>    the human.

The preference stands, and it stops being free on the applications this has to work against. A
server-rendered, table-laid-out page frequently yields an accessibility tree with no accessible
names and little structure — the model is being shown almost nothing, and asking it to map controls
from that is asking it to guess, which
[Decision 12](#decision-12--resolution-at-the-publish-gate-is-exact) then refuses at the gate.

Amended to: **structured representation first; a screenshot alongside it when the structure is
impoverished, with the additional cost metered** (§9, and Decision 6 constraint 4). The test for
"impoverished" is mechanical rather than a judgement — a region whose interactive elements have
neither an accessible name nor a form `name` or `id`. Both are captured as provenance either way,
so what the model was shown stays reviewable.

Constraints 3, 4 and 6 are unaffected.

---

## Decision 7 — Which model, and where it runs

**Status:** adopted.
**Settles:** which model serves authoring, and how the routing changes later without disturbing
anything already published.

### What makes this a small decision

[Decision 6](#decision-6--where-a-model-may-drive-a-browser) did the work that would otherwise
make this hard. A model is consulted **while a person is authoring** and never while a published
version is executing. So the provider sits entirely on the authoring side of that line, and one
consequence follows immediately and is worth stating plainly:

**Changing the model or the provider cannot change what any published version does.** §4's
immutability and §10's reconstructability are untouched by this decision, because nothing the
model does is in the execution path. A provider swap is not a version change, does not require a
republish, and cannot alter a past run. Very little else in this document is that cheap to change
later, and it is cheap only because Decision 6 was taken first.

### Decision

**OpenAI directly for local development; routed through Amazon Bedrock in production, later.**
With four constraints that make the swap a configuration change rather than a migration:

1. **One `ModelProvider` interface**, with the provider named in configuration and never in the
   code that calls it. Local is OpenAI; production is Bedrock
   ([Decision 8](#decision-8--where-this-runs)).
2. **Structured output, validated before anything is kept.** `docs/engineering/engineering-instructions.md` rule 7: "A model
   proposes; it never writes. Output is validated before anything is kept." The validating schema
   belongs to Orbit, not to a provider's structured-output feature, so the same validation holds
   when the provider changes and a provider that validates less strictly cannot weaken it.
3. **Every call recorded, metered and redacted**, through the capture path in
   [Decision 4](#decision-4--evidence-storage). §12 requires it: "every call is recorded with what
   it was asked, what it returned, what it cost, and what it was looking at — **including calls
   that produced nothing usable**". The record names the provider and the model, because §10's
   evidence table asks for "what a model was shown, what it answered, its confidence, the model
   used and the cost" — and which model answered is not recoverable later from a record that does
   not say.
4. **Cost is recorded in the provider's own units and in a provider-neutral unit** — tokens and
   money as billed, alongside the call count and the model name. §9's spend ceilings are out of
   scope for slice 1, but a spend history that changes units when the routing changes cannot be
   summed across the change.

### What this sends where, stated rather than implied

Running OpenAI locally means the content of the registered application's pages, and the procedure
text the author wrote, leave the machine and reach a third party. This is recorded rather than
assumed because §12 is a document about knowing what happened to data.

Two things bear on it, and the first is weaker than it was:

- **What is registered is what is sent.** Decision 6's constraint 1 used to bound this to a
  practice copy; with the practice/live distinction removed it no longer does
  ([amendment](#amendment-to-decision-6-the-practicelive-distinction-is-removed)). What reaches
  the provider is now whatever is behind the registered application's hosts. For slice 1 that
  should be a system whose data does not matter — a deployment discipline, not a guarantee, and
  named as such.
- [Decision 4](#decision-4--evidence-storage) item 7 — the run's secret values are held in memory
  for redaction and are never persisted. The same set is what a model call is redacted against
  before it is sent, not merely before it is stored. **Redaction applies outbound, not only to the
  evidence**: a value that must not reach an artefact must not reach a provider either, and the
  provider's copy is one Orbit cannot withhold after the fact.

That last point is the only new obligation in this decision. Everything else follows from
decisions already taken.

### How this is tested

- The same authoring case run against two providers produces workflows that validate against the
  same schema, and a proposal that fails validation stores nothing — acceptance criterion 2.
- A model call whose response does not validate is recorded, with its cost, as a call that
  produced nothing usable, and nothing from it is kept.
- No secret value and no field declared sensitive appears in what is sent to a provider, asserted
  against the recorded request rather than against the code that builds it.
- The recorded model call names the provider, the model and the cost, and a run's authoring
  provenance remains readable after the provider changes.

---

## Decision 8 — Where this runs

**Status:** adopted.
**Settles:** the local and production targets, and which of decisions 1–7 they are permitted to
influence.

### Decision

**Local now: PostgreSQL and the filesystem on the development machine, one web process and one
worker. Production later: an AWS stack, with agent execution on Bedrock AgentCore.** Recorded so
that the target is explicit and so that the next item — what it may and may not change — has
something to attach to.

### What the production target is allowed to decide, and what it is not

This is the substance of the decision. A hosting platform is a place to run, and the requirements
in §4, §10 and §12 are about what is recorded. Those are separable, and keeping them separate is
what makes the move a deployment change.

**The deployment is United States only.** Production is `us-east-1`; the record store, the
evidence store and the authoring reasoning records stay inside it, and nothing is written to a
region outside the United States. Two consequences worth stating rather than discovering:
`us-east-1` carries the broadest Bedrock model availability, which matters when
[Decision 7](#decision-7--which-model-and-where-it-runs)'s routing changes; and today's OpenAI
egress is domestic, which narrows but does not remove the fact that a third party reads the pages
of whatever application is registered.

**It may decide** where a worker executes, where bytes are stored, how processes are supervised,
how the browser is provisioned, and which model endpoint is called.

**It may not decide** any of the following, each of which stays in Orbit's own store and Orbit's
own code:

| Not the platform's to own | Requirement |
|---|---|
| The run journal and the step attempt record | §10 — *"reconstruct what happened from stored records alone, without re-running anything"* |
| The audit history | §12 — *"The audit history is append-only and tamper-evident"* |
| The published version and its content digest | §4 — *"Publishing mints a new immutable version. It is never an edit of an existing one."* |
| The artefact record and its integrity digest | §12 — *"Orbit verifies an artefact against its digest when serving it"* |
| The actor record, when it is built | §12 — *"established by the platform, never supplied by the caller"*, where the platform is Orbit ([Decision 1](#decision-1--identity)) |

A managed identity service is authentication, not an actor record — the distinction
[Decision 1](#decision-1--identity) drew when it ruled out Option C, and it applies to a cloud
provider's identity service exactly as it applied to a generic one.

### The one thing to check before adopting a managed browser

AgentCore's browser tooling records its own sessions and writes them to object storage. That
recording is produced by the platform before Orbit sees it, which is the same shape as the problem
[Decision 4](#decision-4--evidence-storage) item 6 already identified in a browser driver's native
trace, and it meets the same requirement:

> Orbit applies redaction **before an artefact is stored, not after** … (§12)

So a managed browser's native session recording **cannot be Orbit's evidence**. Orbit keeps
building its own trace from its own structured events and its own redacted snapshots, exactly as
Decision 4 states, and treats any platform-side recording as something to disable or to hold
outside the evidence record — never as a convenient substitute. Worth knowing now, because it is
the kind of thing that is discovered during a migration and then argued about under time pressure.

### How this is tested

- The full slice 1 acceptance suite runs against the local target with no cloud dependency, so a
  failure is never ambiguous between Orbit and a platform.
- Storage, execution and model access are reached only through their interfaces, asserted by a
  test that no module outside a driver imports a provider or cloud SDK directly.

---

## Decision 9 — Backend stack

**Status:** adopted.
**Settles:** the language and runtime the API, the worker and the authoring session are written in.

### The requirement

No section of §4, §10 or §12 names a language, and none can be made to. What they do constrain is
how closed sets and boundaries must behave, and `docs/engineering/engineering-instructions.md` turns that into a standard:

> Strict type checking. No escape hatches into untyped values.

> Prefer discriminated unions for anything with a closed set of kinds — steps, events, errors,
> statuses.

One requirement does reach the language choice indirectly, and it is the reason this decision is
recorded rather than assumed:

> Orbit displays one derived status per workflow, in one vocabulary, everywhere the workflow
> appears. The status is computed from the facts the system already holds … and never stored
> separately, so it cannot disagree with them. (§4)

"Everywhere the workflow appears" includes the interface. A status vocabulary defined twice — once
in the backend, once in the frontend — is a vocabulary that can disagree with itself, which is the
one thing that sentence forbids.

### The options

**Option A — TypeScript on Node.** One language across the API, the worker and the interface.
Discriminated unions, exhaustiveness checking and branded types are first-class. Playwright and
the MCP client libraries are maintained here first.

**Option B — Python with FastAPI.** The strongest model and automation ecosystem; pydantic gives
real validation at boundaries. Costs a second language for the interface, and a second definition
of every record the interface renders.

**Option C — Split: a Python worker for the model and browser work, TypeScript for the API,
queue and interface.** Best tool on each side of the line, at the cost of a process boundary and
a versioned contract across it.

### The trade-off

B and C are both defensible on capability. What decides it is the §4 sentence above: every status,
outcome, step kind, event kind and error kind in this product is a closed set, and each one shown
in the interface has to mean the same thing in both places. A and C differ on how many times those
sets are declared — once in A, twice in C, with a contract to keep them aligned. B pays that cost
too, and adds nothing the other two lack now that
[Decision 7](#decision-7--which-model-and-where-it-runs) puts the model behind an interface and
[Decision 11](#decision-11--how-a-workflow-is-authored) keeps the browser work in the authoring
session rather than spread through execution.

C's appeal is real and will grow. Slice 1 is the wrong moment for it: a contract between two
runtimes is a thing to maintain before one loop has ever closed.

### Decision

**Option A — TypeScript on Node**, with:

1. **Every closed set declared once**, in a module both the API and the interface import — step
   kinds, run statuses, workflow statuses, event kinds, error kinds, business outcomes. §4's
   "cannot disagree with them" is enforced by there being one declaration, not by two being kept
   in step.
2. **Exhaustiveness checked at compile time** on every union. A new step kind that some switch
   does not handle is a type error, not a runtime surprise.
3. **Schema validation at every boundary** — inbound requests, persistence reads, and anything a
   model returns — with unknown keys rejected rather than stripped, which is what makes
   [Decision 1](#decision-1--identity) item 4 hold.
4. **Branded types for anything that must not be interchangeable**: version identifiers, run
   identifiers, artefact digests, actor references when they arrive.
5. **No escape hatches.** `any` is not available; an unavoidable boundary is typed `unknown` and
   validated before use.

### How this is tested

- Adding a member to any closed set produces compile errors at every site that must handle it, and
  the build fails until each is addressed.
- A request carrying an unknown key is rejected, not silently accepted with the key dropped.
- The interface and the API resolve the same workflow to the same status string, asserted against
  the shared declaration rather than against two fixtures.

---

## Decision 10 — Frontend stack and design system

**Status:** adopted.
**Settles:** how the interface is built, and what it is built out of.

### The requirement

The interface is where this product's claim is either made good or lost, so the requirements here
are unusually specific for a frontend decision.

> Orbit displays one derived status per workflow, in one vocabulary, everywhere the workflow
> appears … never stored separately, so it cannot disagree with them. (§4)

> A list that could not load and a list with nothing in it look identical if both are blank, and
> they mean opposite things. Orbit distinguishes nothing-yet, nothing-matching, not-loaded-yet and
> could-not-load in every list, and never allows one to be mistaken for another. (§3)

> **Requirement: technical status and business outcome are never merged** … A run that correctly
> established that a record does not exist has **succeeded** technically and reached the business
> outcome *request not found*. It is never shown as a failure. (§10)

> Every artefact carries its size, type and an integrity digest. (§12)

Each of those is a component with required behaviour, not a matter of taste. A design system for
this product is mostly the job of building four or five of them correctly and using them everywhere.

### The options

**Option A — React and TypeScript over headless, accessible primitives, with our own design
tokens.** Focus management, dialogs, menus, and keyboard behaviour come from unstyled primitives;
the type scale, spacing and colour are ours and defined once.

**Option B — An opinionated component kit** (MUI, Mantine, Ant). Tables, forms, dialogs and dates
already solved, and a finished look on day one.

**Option C — Build everything, including the primitives.** Total control, and a great deal of
accessibility work that is already solved elsewhere.

### The trade-off

B reaches a polished surface fastest, and its polish is somebody else's — recognisable at a glance,
and increasingly resistant as the specification asks for things the kit did not anticipate. The
decisive point is that **the components this product most needs are custom in every option**: the
four-state empty component, the derived status chip, the status-and-outcome pairing, and the
evidence viewer with digests are specified behaviour that no kit ships. B therefore buys the easy
half and leaves the hard half, while constraining how the hard half can look.

C spends its first weeks rebuilding focus traps and combobox semantics, which serves no requirement
in this document.

### Decision

**Option A.** Specifically:

1. **Tokens before components, and swappable at run time.** Colour, type scale, spacing and
   radius are defined in one place and referenced everywhere; a value chosen inside a component is
   a defect. The tokens are CSS custom properties resolved **per workspace at run time**, not
   compiled in — so a customer's branding is data the deployment serves, never a rebuild. This
   costs nothing to do now and is a re-write of every component to retrofit. The discipline that
   makes it true: **no component names a colour**, asserted by a test that fails on a hex literal
   outside the token file.
2. **Five components carry the specification**, and are built first because everything else uses
   them:
   - `StatusChip` — the single derived status, the only way a status is ever rendered.
   - `EmptyState` — four variants, never a default: *nothing yet*, *nothing matching*, *not loaded
     yet*, *could not load*. There is no way to render a blank list without choosing one.
   - `OutcomePair` — technical status and business outcome as two labelled facts, which makes
     §10's *succeeded / not found* impossible to render as a failure.
   - `EvidenceItem` — artefact with size, type and digest, previewing inline where it can and
     stating that an artefact was withheld, with the reason, where it was.
   - `RefusalNotice` — a named blocker with a link to what caused it, used by publication,
     resolution and permission refusals alike.
3. **Status is never computed in the interface.** It arrives derived from the API, from the
   declaration shared under [Decision 9](#decision-9--backend-stack). The frontend renders a
   status; it never decides one.
4. **Accessibility is not a later pass.** Keyboard reachable, visible focus, labelled controls and
   sufficient contrast are the reason to take headless primitives rather than build them.
5. **No placeholder anything.** No lorem ipsum, no unstyled default control, no screen that works
   only with the fixture it was built against.

### How this is tested

- No list renders blank: a test asserts every list view resolves to one of the four `EmptyState`
  variants or to rows.
- A succeeded run with the *not found* outcome renders with no error region and no failure styling.
- A withheld artefact renders as withheld with its reason, never as a broken preview.
- The status shown for a workflow equals the status the API derived for it, compared directly.
- Keyboard-only traversal reaches every interactive control on the run page and the review page.

---

## Decision 11 — How a workflow is authored

**Status:** adopted.
**Settles:** what the model does during authoring, what drives the browser, and what has to be
true before a mapping can enter a published version.

### The requirement

> Publication is the gate. Orbit refuses to publish a workflow it cannot resolve completely: an
> incomplete step, a value no step in the workflow produces, a path that reaches no declared
> ending, or an instruction it does not fully understand each block publication, and the refusal
> names the specific blocker rather than reporting a general failure. (§4)

> Stops when the control no longer matches what was approved, when a page does not reach the
> expected state, when navigation fails, or when an assertion fails. Each is a distinct, named
> failure. (§7, browser applications)

And [Decision 6](#decision-6--where-a-model-may-drive-a-browser), which this decision implements:
a model may drive a browser while a person is authoring, and never while a published version is
executing.

### The options

**Option A — Text to steps, resolved deterministically.** The model turns the written procedure
into structured steps without seeing the application. Orbit then walks the flow and matches each
named field to a control by its accessible name.

Ruled out by the applications this has to work against. On a server-rendered, table-laid-out page
the accessibility tree frequently gives a textbox no accessible name at all — there is nothing for
a name-based match to bind to, and the pass fails on the first field rather than on a hard one.
A is not wrong in principle; it is inapplicable in fact, and saying which of those it is matters.

**Option B — Model maps, Orbit verifies.** The model reads the procedure and the page structure
and proposes which control each instruction means. Orbit converts the proposal into a durable
locator, verifies it resolves to exactly one element, and the author confirms it. Publication then
re-verifies.

**Option C — The model drives, and what it did becomes the workflow.** The session's actions are
recorded and replayed as the workflow.

Ruled out. The session's actions are taken against element references that exist only within that
snapshot, so replaying them is not reproducible; and §4 requires the published version to be
something Orbit resolved completely, not a transcript it is trusting.

### The trade-off

A is cheaper and repeatable where it works, and it does not work here. C is the least work and
produces an artefact nobody can verify. B costs the most — a session lifecycle, turn-by-turn
provenance, metering, and a conversion step — and is the only one of the three that produces a
published version whose every control was confirmed to resolve.

### Decision

**Option B — the model maps, Orbit verifies.** The division of labour is the decision:

| | Does | Never does |
|---|---|---|
| **Author** | Supplies the procedure. Reviews every mapping. Corrects what is wrong. Attests and publishes. | — |
| **Model** | Reads the procedure and the page structure. Proposes step structure and which control each step means. | Navigates on its own authority. Writes anything durable. Supplies an address. |
| **Playwright MCP** | Runs the browser. Returns the page as structure. Performs interactions when told. | Decides where it is permitted to go. |
| **Orbit** | Holds both connections. Checks every navigation before it happens. Converts proposals into durable locators. Verifies resolution. Captures and meters every turn. | Trust the model with a boundary. |

1. **Orbit runs the loop and is the MCP client.** The model has no connection to Playwright MCP
   and never will. Orbit is the OpenAI client and the MCP client, and it moves between them.
2. **Orbit exposes its own tools to the model, not MCP's.** Narrower by construction: there is no
   tool that accepts a URL, so the model cannot supply an address. This is `docs/engineering/engineering-instructions.md`
   rule 7 — "bound every model call, and make the bound structural" — as an absent capability
   rather than as a check that could be forgotten.
3. **A proposal is converted, never stored.** Element references from a snapshot are valid for
   that snapshot only and can never enter a published version. Orbit resolves the reference to the
   underlying element and derives a durable locator from it, by the ladder below.
4. **The locator ladder**, in order, stopping at the first rung that yields an exact predicate:
   1. Role and accessible name.
   2. Form `name` or `id`. On server-rendered applications this is frequently the strongest
      available: a form control's `name` cannot change without breaking the handler that reads it.
   3. Exact text of a structurally identified neighbour — the control in the cell beside the cell
      whose text is exactly *X*.
   4. Structural anchor — the control at a named position within a named region.
   5. No rung yields an exact predicate → the step does not resolve, and publication is refused.
5. **Weaker signals become corroboration, never fallback.** A fallback proceeds on a second guess
   when the first fails; corroboration stops. Each locator carries what must also be true about
   the element it found, and a mismatch halts the run rather than continuing against something
   else. This is what stops a run typing a claim number into the username field of a session-expiry
   login page that happens to occupy the same position.
6. **The frame path is part of every locator.** Frameset applications place the same control in
   different frames depending on how the page was reached.
7. **Every turn is provenance.** What the model was shown, what it proposed, what it cost,
   including turns that produced nothing usable — §12, and
   [Decision 6](#decision-6--where-a-model-may-drive-a-browser) constraint 3.
8. **Execution consults nothing.** At run time there is no model and no MCP. Orbit drives
   Playwright directly from the locators in the published version.

### The second way in, and why it is easier than this one

`docs/slice-1-brief.md` names **recording a demonstration** as slice 2, on the grounds that it is
"the requirement most likely to invalidate slice 1's data model". It is also, on the applications
this has to work against, **more accurate than the route above**: the person clicks the actual
control, so the question this decision spends its effort on — *which control did the instruction
mean* — is answered by the click. The locator ladder, the corroboration rule and
[Decision 12](#decision-12--resolution-at-the-publish-gate-is-exact)'s exact gate all still apply,
unchanged.

Everything after the draft is identical. Recording produces a draft; from **check the draft**
onward there is one path.

Three cautions, recorded now because each is a defect if discovered late:

1. **A recording captures keystrokes, including passwords.** It is the highest-risk capture
   surface in the product. Keystrokes into a field carrying a secret are discarded at capture —
   the field is remembered, the value never reaches disk — and the rest follows
   [Decision 4](#decision-4--evidence-storage)'s capture path.
2. **One recording is one path.** It shows the ending that happened. The others must be recorded
   separately or described, and §4 will not publish a path that reaches no declared conclusion.
3. **The author records as themselves; the agent runs as the registered credential.** A control
   visible to a person may not be visible to the service account. Every recorded locator is
   re-resolved as that account before publication, and any it cannot reach is named — otherwise
   the first real run fails on something that worked perfectly while recording.

### How this is tested

- A page whose textboxes have no accessible name still produces confirmed mappings, and each
  stored locator resolves to exactly one element on a fresh snapshot.
- No element reference from a snapshot appears anywhere in a published version.
- A locator whose corroboration fails halts the run with a typed error naming the step, and does
  not act on the element it found.
- The model is offered no tool that accepts an address, asserted against the tool definitions sent
  to the provider.
- A run of a published version completes with the authoring session's provider unreachable.

---

## Decision 12 — Resolution at the publish gate is exact

**Status:** adopted.
**Settles:** what "resolves" means, and what happens when a name matches nothing, or more than one
thing.

### The requirement

> Publication is the gate. Orbit refuses to publish a workflow it cannot resolve completely … and
> the refusal names the specific blocker rather than reporting a general failure. (§4)

> **Refuse rather than guess.** Where Orbit cannot establish what was intended, it stops and says
> what it could not establish. (§13)

> Stops when the control no longer matches what was approved … Each is a distinct, named failure.
> (§7)

### The options

**Option A — best match above a confidence threshold.** Score candidates by label similarity and
proximity; take the highest scorer if it clears a threshold.

Ruled out. §13's first rule is "Refuse rather than guess", and a threshold is a guess with a number
attached to it. It also fails §4's requirement that a refusal *name the specific blocker*: a score
below a threshold names nothing a person can act on, and a score above one hides that a judgement
was made at all.

**Option B — exact resolution; exactly one match or refuse.** A named field, control or region
resolves by an exact predicate. One match publishes. Zero or more than one is a refusal that names
what did not resolve and why.

**Option C — exact resolution with a deterministic tie-break**, such as first in document order.

Ruled out, and it is the one worth arguing about because it sounds safe. Determinism is not the
property §4 requires; **identifiability** is. If two elements satisfy the predicate then the name
does not identify a control, and document order invents an identification the author never
supplied. Two runs would agree with each other and both could be wrong, which is precisely the
failure this product exists to make impossible — and §7 requires Orbit to stop "when the control
no longer matches what was approved", which presumes the approved thing was ever a single control.

### The trade-off

A and C both publish more workflows. That is their entire advantage, and it is an advantage only
if publishing a workflow is the goal. Under §4 the goal is publishing a workflow that could not do
something other than what was approved, and both options achieve the first by abandoning the
second. B refuses more often, and every refusal is a question a person can answer.

### Decision

**Option B.** Stated as rules, because this is the kind of thing that erodes under deadline
pressure:

1. **Resolution is exact.** No fuzzy matching, no similarity scoring, no nearest-label, no closest
   reasonable candidate, no confidence threshold. A predicate either holds of an element or it does
   not.
2. **Exactly one, or refuse.** Zero matches is a refusal. **Two or more matches is also a refusal**
   — ambiguity is a failure, not a tie to be broken.
3. **The refusal names what did not resolve and why**, distinguishing *nothing matched this* from
   *more than one thing matched this*, and it names the step, the field and the page. A general
   failure message does not satisfy §4.
4. **A person resolves ambiguity by narrowing the address**, never by Orbit choosing. The author
   supplies a more specific locator and publication is attempted again. Orbit never breaks the tie
   itself, and never remembers a tie-break for next time.
5. **The same rule applies at every gate**: when the model's proposal is converted during
   authoring, when publication verifies, and when a run resolves a locator against a live page.
   A control that resolves to two elements at run time halts the run; it does not take the first.
6. **The rule is not relaxed for a rung of the ladder.** A structural anchor is exact — *the
   control in the cell beside the cell whose text is exactly "Claim Number"* is a predicate that
   holds of one element or does not hold. What is forbidden is not structure; it is approximation.

The distinction that makes this workable: **the model may propose by judgement — that is its job,
and a person confirms it — but the proposal only becomes part of a version by resolving exactly.**
Judgement on the way in, exactness at the gate.

### How this is tested

- A page with two controls satisfying one predicate refuses publication, names both, and does not
  publish.
- A page with no control satisfying a predicate refuses publication and names the step and field.
- The refusal text distinguishes *nothing matched* from *more than one matched*.
- No scoring, similarity or threshold appears in the resolver, asserted by the absence of any such
  parameter in its interface.
- A run whose locator matches two elements halts with a typed error rather than acting on either.

---

## Decision 13 — A judged step, and what holds it

**Status:** adopted as a shape. **Not built in slice 1.**
**Settles:** how a decision that needs judgement is expressed, so that it is never later built as
"ask the model what to do".

Recorded before it is needed, because it is the one capability whose careless version destroys the
product's central claim. A `judge` step that returned free text would make the sentence the whole
product rests on — *"to be sure it could not have done anything else"* — false for every workflow
containing one.

### The requirement

> **Bound every model call, and make the bound structural.** A model proposes; it never writes.
> Output is validated before anything is kept. A judged decision returns a choice from a list the
> workflow already declares — it cannot invent a branch, name a control, supply an address, or
> choose an action. (`docs/engineering/engineering-instructions.md`, rule 7)

> Where a decision must be made against written policy, the policy is registered and approved here
> as a versioned artefact. A workflow cites an approved version, and a run refuses to proceed if
> the policy it pinned is not what the deployment currently holds. (§8, Figure 37)

> **Refuse rather than guess.** Where Orbit cannot establish what was intended, it stops and says
> what it could not establish. (§13)

### The options

**Option A — the model is asked what to do, and the answer is acted on.** Ruled out by rule 7 in
its entirety, and by §13's first sentence. It is named here only so that the rejection is on the
record rather than assumed.

**Option B — a tenth step kind whose answer is a choice from a declared list.** The workflow
declares the question, the possible answers, the values the model may see, and the policy version
it is judged against. The model returns one of the declared answers, a confidence, and a reason.

**Option C — no judged decisions at all; every such point becomes a hand off to a person.** Wholly
compliant, and it is what slice 1 does. It stops being tenable at scale: a procedure that hands off
every judgement is a procedure nobody automated.

### The trade-off

Between B and C: C is safe and limited, B is useful and needs its constraints to be structural
rather than remembered. B is only acceptable because the model's answer is drawn from a set the
workflow already fixed — which means the *set of things a run can do* is unchanged by adding a
judged step. That is the property that keeps §4 and §12 intact, and it is the whole reason B is
admissible.

### Decision

**Option B, with C as slice 1's behaviour.** A `judge` step declares, and a run records:

1. **The question**, in the author's words.
2. **The closed list of answers.** The model returns one of them. It cannot return anything else,
   because nothing else is accepted by the validator, and a response outside the list is a call
   that produced nothing usable — recorded, metered, retried, never acted on.
3. **The values it may see**, named explicitly. It cannot go and look for more, because it has no
   tool that reaches anything.
4. **The approved policy it is judged against**, pinned by version. §8: a run refuses to proceed
   if the deployment no longer holds that version. It is judged against written policy, never
   against a model's general opinion.
5. **A confidence floor, declared by the workflow.** Below it, the step becomes a hand off and a
   person decides. The floor is part of the published version, so it cannot be relaxed at run time.
6. **Every call recorded** — what it was shown, what it answered, its confidence, its reason, the
   model and the cost, including calls that produced nothing usable (§12).

And cannot, structurally rather than by instruction:

| It cannot | Because |
|---|---|
| Answer outside the declared list | The validator accepts nothing else |
| Name a control, field or page | It is offered no tool that takes one |
| Supply an address, or reach anything | Same — see [Decision 11](#decision-11--how-a-workflow-is-authored) item 2 |
| Choose what happens next beyond the declared paths | Each answer maps to a path the version already fixed |
| See a value the workflow did not hand it | The values it may see are a declared list |

**A judged step is the only place a model runs during execution**, which reopens
[Decision 6](#decision-6--where-a-model-may-drive-a-browser)'s line — and deliberately narrows it
rather than moving it. Decision 6 forbids a model *choosing actions* at run time. A judged step
chooses no action: it returns a value from a set fixed at publication, and the workflow acts. Two
runs of one version still reach one of the same declared endings, and what the version could not
have done is unchanged. If that ever stops being true — if a judged answer could name a control,
an address, or a path the version did not declare — Decision 6 is broken and this decision is void.

### How this is tested

- A response outside the declared list is recorded, metered, and discarded; the run retries and
  then hands off. It is never acted on.
- A run whose pinned policy version is not what the deployment holds refuses to start, naming the
  policy and both versions.
- A confidence below the declared floor produces a hand off, not an answer.
- The tool definitions sent to the provider for a judged step contain no free-text field, no
  address, and no control name, asserted against the request as sent.
- Adding a judged step to a workflow does not change the set of endings the version can reach.

---

## What these decisions commit each other to

The decisions are not independent, and it is worth stating the joins so that a later change to one
is recognised as a change to the others.

- **Decision 1 → 2, 3, 4.** The deferral is the join that matters. Audit entries, versions,
  reconciliation events and artefact accesses each have a place an actor will go and nothing in
  it; when identity is built, all four records change shape at once, and Decision 3's chain
  becomes worth building at the same moment.
- **Decision 2 → 3.** The run journal is the run's record. Moving execution to an engine — or to a
  managed runtime — that keeps its own history reopens Decision 3's single-source rule. This is
  why [Decision 8](#decision-8--where-this-runs) draws the line where it does.
- **Decision 3 → 5.** A published version's immutability is worth nothing if the boundary it was
  approved against lives in a mutable row. Decision 5's copy-into-the-version is what makes
  Decision 3's content digest mean "what it could not have done".
- **Decision 4 → 6.** Authoring is permitted to use a model against a registered application, and
  §12 requires every such call to be recorded — including the ones that produced nothing usable. Those
  records go through the same capture path and the same redaction as run evidence.
- **Decision 5 → 6.** The allowlist Decision 6 insists Orbit enforce itself is a field of the
  immutable version, resolved from the registry at publication.
- **Decision 6 → 2.** A browser session does not survive a restart, which is why Decision 2's
  reconciliation is decided by step kind and defaults to halting.
- **Decision 6 → 7.** Because no model runs during execution, the provider is an authoring concern
  only, and changing it cannot alter a published version. Decision 7 is cheap entirely because
  Decision 6 was taken first.
- **Decision 8 → 2, 3, 4, 7.** The production target may choose where things run and never what is
  recorded. If that line moves, all four are reopened.
- **Decision 13 → 6.** A judged step is the only model call during execution, and it is admissible
  only because it returns a value from a set fixed at publication rather than choosing an action.
  If a judged answer could ever name a control, an address, or a path the version did not declare,
  Decision 6 is broken and Decision 13 is void with it.
- **Decision 13 → 5.** A judged step is judged against approved policy text, which is a registry an
  administrator owns — a second thing a published version pins by version, alongside the
  application revision.
- **Decision 5 → 2, 4.** A workflow naming a set of applications means each step records which one
  it ran against, each allowlist is checked per application, and a single run may resolve two
  credentials without ever holding either value.

## What slice 1 will not satisfy

Distinct from what is still open. These are acceptance criteria and requirements that slice 1
**will fail**, by decision rather than by oversight. They belong in `docs/ACTIVE_TASK.md` as
outstanding from the first day, not discovered at the end of it.

| Not satisfied | Because | Requirement |
|---|---|---|
| Acceptance criterion 14 — confirming, publishing, activating and starting a run are attributed to an actor | [Decision 1](#decision-1--identity) defers identity in full | §12, §2 |
| §12's *tamper-evident* half of "append-only and tamper-evident" | [Decision 3](#decision-3--persistence-and-immutability) item 4 defers the chain | §12 |
| §2's "every access to an artefact is itself recorded" | There is no actor to record it against | §2 |
| §12's environment separation — practice and live distinct, promotion by an approved act, the environment recorded on each run | [Decision 5](#decision-5--what-a-registered-application-is) item 6 removes the concept for slice 1 | §12 |
| §10's test run "executes against the practice copy" | There is no practice copy; a test run is marked as such and runs against the one registered application | §10 |

The first three of these are listed together because they resolve together, but not for identical
reasons, and the difference matters when they are scheduled. The first and third are **blocked**
by [Decision 1](#decision-1--identity): there is no actor to attribute an act to or to record an
access against, and no amount of other work produces one. The second is **sequenced** behind it by
choice — the hash chain could be built tomorrow, and [Decision 3](#decision-3--persistence-and-immutability)
item 4 defers it because tamper-evidence over entries that name nobody proves only that an
unattributed record was not altered. So all three close on the day identity lands; only two of
them were waiting for it.

## What is still open

Named here so that an omission is not mistaken for a decision.

- **When identity is built, and what triggers it.** Decision 1 names the trigger — the first real
  procedure published by a real person in this system — rather than a date. The *design* is
  settled; only the timing is open.
- **Authentication mechanism**, when identity arrives. Decision 1 rules out a provider's subject
  claim as the actor record, and rules out nothing else; local sign-in and a federated provider
  are both available as the authentication method above an Orbit-owned actor row.
- **Roles and permissions** (§2) — excluded from slice 1 by the brief, and unaffected by Decision
  1's deferral: they were always later.
- **External anchoring of the audit chain.** Decision 3 reserves the checkpoint column and does not
  fill it, and the chain itself is now deferred with it. The residual risk is stated there.
- **Retention and expiry** (§12) — excluded from slice 1. Decision 3 item 6 keeps the schema free of
  a delete path so that retention is additive.
- **Environments, and promotion between them** (§12) — removed from slice 1 by Decision 5 item 6,
  returning with roles. Until then the host allowlist is the only boundary, and Decision 6's
  amendment says what that costs.
- **The closed set of step kinds.** Decision 5 item 9 fixes that step kinds are surface-neutral and
  names a working set — `open`, `enter`, `activate`, `read`, `collect`, `check`, `branch`,
  `hand off`, `end`, with `judge` held back by
  [Decision 13](#decision-13--a-judged-step-and-what-holds-it). That set has been drawn and
  reviewed but **never ratified as a decision**, and almost everything else depends on it: the
  schema, the editor, the executor, the run page and the acceptance tests. It should be the next
  decision written.
- **The frontend stack, and the design system behind it.** Nothing has been chosen. It is a real
  decision, not a detail: `docs/engineering/engineering-instructions.md`'s "Interface standards" sets the bar, and most of
  that bar is specified behaviour from §3, §4 and §10 rather than taste — one derived status shown
  identically everywhere, four distinct empty states, technical status and business outcome as
  separate facts. Choose before the first screen, and record it here as Decision 9.
- **Which OpenAI model, and the browser tooling behind the authoring session.** Decision 7 fixes
  the provider and the interface; the model and the driver are implementation choices that reach
  no record, provided the interface holds.
- **When production is stood up.** Decision 8 fixes the target, the region and the line it may not
  cross. No AWS work is in slice 1, and none should start before the local acceptance suite passes.
- **The closed set of value types.** The step editor declares typed inputs and outputs; the set of
  types is as closed as the set of step kinds and has not been settled. It belongs with them.
- **When a judged step is built.** [Decision 13](#decision-13--a-judged-step-and-what-holds-it)
  fixes its shape and slice 1 hands off instead. The trigger is the first procedure a customer will
  not automate without one.

## Open questions for `docs/engineering/engineering-instructions.md`

The **Architecture rules** `[decide]` marker is answered by this file: its "at minimum record"
list is exactly decisions 1–5, and it should be replaced with a reference here. The **Commands**
marker is not answered and stays open until the package scripts exist.

Two things in `docs/engineering/engineering-instructions.md` now need a person's attention rather than a reference:

- It describes `decision-draft-model-driven-browser.md` as a **draft**. The file exists at
  `docs/decision-draft-model-driven-browser.md` and its body is byte-identical to
  [Decision 6](#decision-6--where-a-model-may-drive-a-browser), which records it as adopted. The
  draft file is now provenance, not a pending decision, and CLAUDE.md should say so.
- Its statement that the specification's §2 identity requirements are in scope for slice 1 — via
  `docs/slice-1-brief.md` — is contradicted by [Decision 1](#decision-1--identity). CLAUDE.md
  instructs that a contradiction be named rather than resolved silently; it is named here, and in
  Decision 1, and neither the brief nor the specification has been edited to agree.
