# Known, decided against for now

Work that is understood well enough to do, and deliberately not done yet.

This is not the record of what has shipped — that is `ACTIVE_TASK.md`, and its
"Outstanding in slice 1" table covers what slice 1 knowingly does not satisfy.
This file is for the smaller things: a divergence from the specification, a
gap somebody has already looked at, a decision left open. An item here should
say what it is, why it is not done, and what closing it would take.

---

## Editing a workflow while a version is live

**What.** `apps/web/src/screens/Agent.tsx` sets `const editable = !live`, so the
step editor disappears the moment a version is activated. Moving, deleting,
inserting and editing a step are all withdrawn.

**Why it is wrong.** §4's status table asks for the opposite:

> | **Active — changes in progress** | A version is live and a newer draft is
> being edited. | Continue editing. | Nothing in the draft affects the live
> version until it is published. |

A run executes the *version*, not the draft. The two are different objects, and
the version's immutability is already enforced by the schema — `UPDATE` and
`DELETE` are revoked and a trigger refuses them besides. The editor was
withdrawn to protect something that was never at risk.

**What closing it takes.**

1. `editable = true`. The draft and the live version cannot affect each other.
2. Add the fifth status. `Active — changes in progress` does not exist in the
   interface, and it is the thing that makes editing-while-live legible: it
   says a newer draft is being worked on while an older version keeps running.
   Without it the rail shows `Active` and nothing hints that the steps on
   screen are not the steps that execute.
3. Say which is which on the steps list. While a version is live and the draft
   has moved on, a reader is looking at steps that no run will take. That has
   to be visible, or the page tells a comfortable lie.

**Not parked by decision.** Nothing in `decisions.md` settles this; it was a
judgement made while building the editor and it was the wrong one.

---

## ~~Activation is off: a version can run without any conclusion being proved~~ — removed

Superseded. The gate was off; now the machinery is gone too, by decision: no
"Test it" panel, no example per ending, and no blocker for the want of one. A
version is published and run, and the run is the proof. `testCases`,
`queueTests`, `activate` and the activation CLI have been removed;
`activate.ts` keeps pause, resume and the version-precedence gate.

What this gives up, plainly: nothing now proves that every ending a version
declares can actually be reached before it runs against a real system. On a
procedure with two conclusions, the second may never have executed. That was
the point of the gate, and it is the cost of removing it.

Retiring an agent arrived with it — `Retire it` on the agent page, which sets
`archived_at`, drops the live version, and records why on the audit trail. It
is not a delete and cannot be: versions, runs, evidence and the model calls
that authored an agent are append-only.

### What the gate used to say



**What.** §4 had an agent unable to touch a real system until every conclusion
it declares had been reached by a real run. Publication now sets
`workflow.live_version_id` directly, so a published version is runnable
immediately.

**Why it is off.** Four stages, where the fourth read as another phase of the
workflow rather than as the check it was. It was also unreachable in practice
for a long time — the control said "Test and activate" and navigated to a
list — which is what made it look like a dead end rather than a gate.

**What is no longer enforced.** A version can be started against a real system
with no evidence that any path through it works. On a procedure with two
conclusions, one of which the available data cannot reach, that used to be an
unresolvable block; it is now simply unproved and runnable.

**What closing it takes.** One line in `mint.ts` — the `UPDATE workflow SET
live_version_id` — and restoring `Active` to the stage rail. Nothing was
deleted: `testCases`, `queueTests` and `activate` are untouched, and the panel
that proves each conclusion is still reachable from the agent page under
"Test it". Restoring the gate is putting a line back, not rebuilding anything.

---

## The digest does not cover what a version is permitted to do

**What.** `mintVersion` digests the body — the steps. `may_change_records` is a
column beside it. So two versions with identical steps have identical digests
while differing in whether they may write.

**Why it matters.** The digest is what proves a version was not altered, and it
currently identifies what the version *says* rather than what it is *allowed to
do*. Version 1 and version 2 of the underwriting agent have the same digest and
different authority.

**What closing it takes.** Move `may_change_records` — and probably the declared
outcomes, inputs and applications — inside the digested body. Existing versions
keep their digests; only new publications carry the fuller one. Worth a line in
`decisions.md` first, because it changes what a digest means.

---

## A retired application cannot be removed

**What.** A test application, `Legacy Claims Desk`, was registered and retired
while checking that the bring-in picker hides retired ones. It cannot be
deleted: `application_revision` is append-only, and the trigger refuses it.

**Why it is not simply a bug.** §7 says an administrator's edit mints a revision
and never alters one, so the refusal is the guarantee working. It is listed
here because the row is still there and will appear on the administration
screen.

**What closing it takes.** Either leave it — it is retired, so the picker does
not offer it — or a migration that removes it deliberately, which is a decision
about whether registry rows may ever be removed rather than a tidy-up.

---

## An address was accepted that no run could open

**What.** The Admin address box takes a host and port; the worker opens
`http://` + it. A full URL pasted in produced `http://http://localhost:4101`,
and every run and every recording against that application failed with
`ERR_NAME_NOT_RESOLVED` — after the registration had been accepted.

**What was done.** A scheme is stripped at the boundary, because pasting the
address out of a browser's bar is the obvious thing to do and there is only
one thing it could have meant. A path is *refused*, not stripped: there is a
field for it beside the box, and quietly dropping it would point every run at
the wrong page rather than at no page.

**What is still open.** Nothing checks that the address answers. The first
time anybody learns an application is unreachable is a failed run, which is
the same shape of problem one layer up.

---

## Publication does not refuse a version whose sign-in cannot happen

**What.** A version may name the registered account and the registered
password for an application that has neither. It publishes, and halts at run
time with `credentialMissing`.

**Why it is not simply a bug.** Halting is correct and loud; the question is
only whether the gate should have caught it. It belongs with pilot-readiness
item 3, "publication must refuse what this deployment cannot execute", which
is the same question for `handOff`, `collect`, `forEach` and the terminal
surface. Answering it once is better than four times.

**What closing it takes.** `checkForPublication` would need to know the
application's sign-in, which means `mint.ts` reading the registered
applications before it checks rather than after, and a blocker kind.

---

## Fifteen defect fixes are held on `held/design-changes`, not on `main`

**What.** Testing the fifty procedures in `docs/testing/testcases-01.md` through
Write It Out found thirty defects. Fifteen were fixed with changes that add to
the model's vocabulary, to the contract, or to what Orbit refuses — design
decisions rather than defect fixes. They are complete, tested and pushed on
`held/design-changes`, and deliberately not merged.

**Why they are held.** They change the design, and the design is settled
elsewhere: in `decisions.md`, in the functional specification, and in the
step and value vocabularies the contract fixes. A defect fix makes the code do
what it already meant to do. These make it mean something new, and that is not
a call to make while chasing a test failure.

**What is on the branch**, in four kinds:

| Kind | Commits |
|---|---|
| New vocabulary for the model | the `open` act; the `contains` operator; the instruction that goes with `open` |
| A new question put to the model | `CONCLUDE_GUARDED` — a conclusions call asked about the condition rather than about a missing value |
| New refusals | repeated commits; contradictory conditions; thresholds compared as numbers; an act kept without its condition; a conclusion kept after its conditional part was dropped; committing after losing the thread; a conclusion from a walk that did not follow the procedure; a comparison decided in advance; a read bound to a heading; a refused second press being said |
| Carried along | clearing the lost-thread latch, which fixes a regression in one of the above |

**What `main` therefore still does**, each of these found and recorded in
`docs/testing/results/defects.md`:

- A conditional procedure can name its two endings the wrong way round. A run
  reads a credit score of **762**, decides `below 620` correctly as false, and
  reports **"Decline the loan due to low credit score"**. Roughly half the
  conditional procedures in section B come out reversed.
- An act whose condition Orbit could not carry is kept without it. A $396,000
  file is referred to a senior underwriter on the strength of not being a
  jumbo, because the loan-amount half of the condition vanished.
- A walk that cannot reach the page a procedure names acts on the page it is
  on. Prompt 16 approves a real loan and reports that the approval was refused.
- Pressing something that commits can be recorded twice, so a run declines the
  same file twice.

**What closing it takes.** A decision on each of the four kinds, and then a
merge. They are separable. The refusals are the ones whose absence is most
costly and the least like new capability — they only make Orbit decline where
it had been doing something — so they are the obvious first to take.

**One design change is on `main` and was not reverted.** `2da372e` adds
`{ from: 'account' }` and the `@orbit/credentials` package. It is a design
change by the same standard, and it is also what stopped the worker typing an
empty string into every password field (`pilot-readiness.md` item 1).
Reverting it would reopen that, so it stays, flagged rather than undone.

---

## An answer to a question changes nothing

**What.** `confirm.ts` writes a note's answer and marks it resolved. Nothing
anywhere reads an answer back. For a question that is really a record — "is
this assumption right?" — that is correct. For one that is a decision, it is
not.

The one that exposed it: a procedure naming a loan file produces a literal, and
Orbit asks whether that is right "or an example of something supplied each
time". An author answered *"its an example. it should be input variable"*, and
the version published bound to that one file, with the answer saying otherwise
on its own record.

**Why it cannot be worked around.** `workflow.declared_inputs` is written once,
by `author-store.ts` when the draft is made, and never updated. So even editing
the step by hand to use an input leaves publication refusing it as a value no
step produces. The author cannot do what the question invited.

**What has been done.** The question no longer offers a choice the product
cannot honour: it says every run will use that one record, and that the way to
make it vary is to give the value as an example on the way in, which is what
makes authoring declare an input. That is a wording fix, not a fix.

**What closing it takes.** A decision first, because it changes what
confirmation *is*. §4 makes confirmation an attestation — the act of saying
"this is the procedure" — and acting on an answer would make it an edit as
well. Either:

- confirmation may change the draft, for the specific questions whose answers
  are decisions (a literal becoming an input is the only one today); or
- the questions stay records, and the *editor* gains what it is missing — a way
  to change a step's value and to declare an input — so the author can act on
  their own answer before confirming.

The second is smaller and keeps §4 intact. Both need `declared_inputs` to stop
being write-once.

**Planned.** The second, in `docs/plans/2026-09-22-procedure-editor.md`: phase P2 (R10,
editing inputs) and P3 (R19, an answer to a question is an edit).

---

## Adding a step produces a draft that cannot be published

**What.** The control that adds a step is hidden. It inserted one deliberately
unfinished and then offered no way to say what it reads — nothing in the
product calls `editStep` — so publication refused the draft from then on.

**Why it is not a small fix.** A step needs a binding, and Orbit derives
bindings from its own view of the page (Decision 15). An author typing one is
the single thing the locator ladder exists to prevent, so the page has to be
looked at.

**What closing it takes.** `docs/step-editing.md`, which also records two
defects found alongside: a hand-added `end` passes confirmation marked complete
and is then refused at publication, because `confirm.ts` sets `complete`
without re-parsing; and the draft screen prints `undefined (undefined)` for an
unconfigured step, one of a family of four.

---

## The procedure editor: what 2.1's editor knowingly leaves undone

Built on `2.1/editor` (P1–P8, `docs/plans/2026-09-22-procedure-editor.md`, §9 for every decision
taken without asking).

**A re-map makes again every step after the first change.** Replay stops at the first changed
sentence and the walk maps from there to the end, so a change to sentence 3 of 20 re-walks 3–20
and redoes any input or rename the author made to those steps. Closing it means splicing new
steps into a graph with branches, and rebuilding only the endings they reach — the riskier change,
left until an author is actually slowed by it.

**The Write It Out suite was not run in full against the editor.** The nine mortgage scenarios
were; the fifty prompts were not, for time. Run it before a pilot.

**A walk can take over ten minutes.** One took sixteen during the scenario runs, almost all of it
waiting on model calls. Nothing is wrong in Orbit's loop; it is what the demo audience will see
if the walk is started live, so start the demo from a drafted agent.

**`record.test.ts` hangs when the whole worker suite runs together.** It passes alone and with
`--test-timeout`. Environmental — a browser left open between files — not yet chased.

**A rule value that is itself a page value starting with "Not".** Orbit reads "is not completed"
as "is not 'completed'", which is right for how procedures are written. A procedure that means the
portal's literal status "Not enrolled" would be read as "is not 'enrolled'". Nothing in the scenarios
does this; the tables screen shows the comparison, so a person can see it.

---

## The green-screen connector and the swivel chair: what 2.2 knowingly leaves undone

Built on `2.2/connectors` (`docs/plans/2026-09-23-green-screen-connector.md`, Decisions 18 and 19).

**No real mainframe has been driven.** The connector is proved against the repo's own loan-servicing
twin, through the independent s3270 emulator. The next check is Hercules running MVS 3.8j (TK5) in
Docker, with KICKS for CICS-style screens: real VTAM sign-on, real keyboard-lock behaviour, real
EBCDIC. TN3270E LU names, code pages and TLS are carried to s3270 but only TN3270 without TLS has
been exercised.

**A rule's action is presses only.** "Attach PMI" on a green screen that wants PF9, then S beside
the condition, then Enter cannot be compiled from a table; the twin attaches a condition with one
key instead. Typing inside a rule's action is the extension.

**A code table's correction is not read back.** Orbit proposes the table and asks; an answer that
says "JUMB is Jumbo, not Jumbo loan" resolves the question and leaves the table as proposed. The
table is kept on the step, so it can be corrected there once the editor shows it.

**Paged lists.** A green-screen list that continues on PF8 ("MORE…") needs `forEach`, which is not
executed yet; a procedure that reads past the first page is not supported.

**Checking a version against the live application before publication** (`resolve.ts`,
`check-publication.ts`) and **recording a demonstration** remain browser-only.

**Retry after "I have checked" replays the version from the start.** A person has said the systems
were looked at; a retry can still press again what went through. Resuming from the failed step is
the fix, and belongs with pilot-readiness item 6 (once-only semantics).

**5250 (IBM i) and character terminals** are out of scope (Decision 18); they would be further
connectors behind the same six parts.
