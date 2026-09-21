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
