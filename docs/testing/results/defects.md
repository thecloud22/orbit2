# Defects found testing Write It Out

One entry per defect. Each names the run and the prompt that exposed it, the
root cause, the fix, the commit, and confirmation that the suite restarted
from prompt 1 afterwards.

---

## Defect 1 — an ordinary login page was ambiguous, and the walk gave up in silence

**Exposed by:** Run 1, prompt 1.
**Severity:** blocking. All fifty prompts begin by signing in.

### What happened

Prompt 1 is *"Sign in to Meridian Home Lending with any user ID and password,
confirm the pipeline loads, and note how many files are awaiting a decision."*

Authoring produced a four-step draft in 21.5 seconds:

```
1  open    Open /login
2  enter   userId, into User ID
3  enter   A secret, into Password
4  end     Pipeline loaded
```

It never pressed **Sign in**, never reached the pipeline, and never counted
anything — yet it declared the conclusion "Pipeline loaded" and raised no
question at all. `workflow_note` was empty.

The session record said exactly why:

| turn | verdict | why |
|---|---|---|
| 1 | kept | step 2: userId, into User ID |
| 2 | kept | step 3: A secret, into Password |
| 3–12 | rejected | `"Sign in" is on the page 2 times, so it names neither` |
| 13 | kept | one conclusion: pipelineLoaded |

### Root cause

Two causes, compounding.

**(a) Candidates were counted before the act was considered.** In
`apps/worker/src/author.ts`, `named = seen.filter(s => calledIn(s) === wanted)`
matched across every kind of element. The check that knows a heading cannot be
pressed ran *afterwards*, on the single survivor — one step too late to stop a
heading competing for the name.

`demo/mortgage-portal/src/pages/LoginPage.tsx` renders an `<h1>` "Sign in"
above a `<button>` "Sign in". Both carried the name, so every `activate`
naming it was refused as ambiguous. This is true of every ordinary login page.

**(b) Running out of turns was silent.** `for (let turn = 1; turn <= maxTurns;
turn++)` simply ended. Nothing recorded that the walk had been truncated, and
the code that follows names a conclusion from whatever steps it has. So a
session cut off two steps into a sign-in produced a draft that looked finished.

(a) made the test fail; (b) turned that failure into a draft that lied.

### Fix

`3e740e1` — *An act competes only with what it could have meant*

- `couldMean(act, element)` hoisted to module level and applied **before**
  counting, and reused as the mismatch check afterwards, so the two cannot
  drift apart. Decision 12 is untouched: two *buttons* called "Sign in" are
  still a refusal, and the `AmbiguousDecisionPage` fixture still behaves as
  designed.
- A name that is on the page but on something the act cannot touch now reports
  the mismatch rather than "not on the page", which would send an author
  looking for a control sitting in front of them.
- Running out of turns now raises a question naming the ceiling and saying that
  what follows is only as far as Orbit got.

### Validation

- New file `apps/worker/src/author.test.ts` — the first test coverage
  `author.ts` has ever had. Four tests, including the login page that exposed
  this and the two-buttons case that must still refuse.
- Full suite: 160 tests pass (contract 6, api 105, worker 49). `tsc --noEmit`
  clean in all five real workspaces.

### Restart

Suite restarted from prompt 1 as Run 2.

---

## Defect 2 — the walk typed nothing into anything

**Exposed by:** Run 2, prompt 1. **Commit:** `6a088ab`.

With the login page no longer ambiguous, the walk pressed Sign in and stayed on
`/login` for every remaining turn, then read the brand block off it and called
it "the pipeline has loaded".

**Root cause.** What the walk typed into a field was `inputs[p.value] ?? ''` —
the author's example values, looked up by whatever the model called the value.
Three of the four things a step can carry are not in that map and never could
be, so all three typed an empty string: a **password** (there is no example for
one and must not be), the **registered account**, and a **literal** — "open the
file ML-26-04502" was looked up as `inputs["ML-26-04502"]`. The login form's
fields are `required`, so the browser refused the submit and nothing moved.

**Fix.** The step Orbit has just built already says where its value comes from,
so the walk types from that. The password is read once in `author-store.ts`,
used to fill the field, and passed nowhere — the step carries the credential's
*name*, as it always did. Also fixed while looking: after a click the walk
waited on the load state of the document it was *leaving*, so it returned
before the navigation began. That is a race rather than the cause here (the old
wait held 10/10 when measured) but a walk that maps the next step against the
previous page is wrong to leave in.

**Validation.** 6 new tests in `author.test.ts` covering every value kind, plus
two browser tests against the real login page. Suite green.

---

## Defect 3 — the walk was never told which account it signs in as

**Exposed by:** Run 3, prompt 1. **Commit:** `683a93b`.

The password filled, but the procedure says "with any user ID and password", so
the model had no user ID, proposed `userID` as a declared input, and the walk
typed `''` into a required field. Five turns, all on `/login`.

**Root cause.** The application's revision carries `sign_in_as` — the account
every run signs in with — and the model was never shown it.

**Fix.** It is shown, beside the declared inputs, with a rule to use it where
the procedure says to sign in. Orbit still does not decide which field is the
account: it supplies a registered fact, the model maps it to a field, and an
entry matching that account becomes `{ from: 'account' }` by the rule already
there. After this the walk reached `/pipeline` for the first time.

---

## Defect 4 — a rejected turn told the model nothing

**Exposed by:** Runs 1 and 4, prompt 1. **Commit:** `89cd42a`.

Run 1 spent ten of twelve turns on one identical rejection. Run 4 spent its
last two on `named "", which was not on the page` — the model had answered
`element: "heading"`, the kind rather than the name, and `normaliseName` strips
a leading kind, emptying it.

**Fix.** A rejected turn carries its reason into the next prompt. Orbit still
rejects and the rejection is still on the session record; it just stops asking
the same question of somebody it has not told. Set inside `record()`, which
every verdict passes through, so it cannot drift from what was recorded. And a
name that normalises to nothing is reported as a kind given where a name was
wanted.

---

## Defect 5 — "finished" and "gave up" were recorded identically

**Exposed by:** Run 5, prompt 1. **Commit:** `70d4028`.

The walk did two of the procedure's three clauses, could not name anything for
the third, and said it was finished. The draft had five steps, no read, no
question and no note — it would publish, run, and report "Pipeline Loaded"
having never looked at how many files there were.

**Fix.** "Done" immediately after a rejection is not the same statement as
"done" after a step was kept, and is no longer recorded as though it were.

---

## Defect 6 — a read bound to a heading published and returned the page title

**Exposed by:** Run 6, prompt 1. **Commit:** `448095f`.

The pipeline page states *"9 files awaiting a decision"* in a sentence, which
the snapshot does not offer as a nameable value, so the nearest thing the model
could name was the heading. It produced `read Underwriting pipeline, into
filesAwaitingDecision` — a step that can only ever return "Underwriting
pipeline".

**Root cause.** `readIsCircular` already refuses this shape for the `text`
strategy. A heading is also located by the words it contains, so the same
circularity applies; the gate was refusing the shape and missing one of its
spellings.

**Fix.** The publish gate covers it. Two test fixtures used `role: 'heading'`
for every read — incidental data chosen before this was recognised — and are
now bound the way a real read is.

**Note on process.** This commit was first made while four `mint.test.ts` tests
were failing: the command chained `git commit` after a `grep` that succeeded on
its own output. Caught immediately, fixed, and amended into the same commit.

---

## Defect 7 — publication passed and the run failed: the ladder fell to its worst rung

**Exposed by:** Run 7, prompt 1, at **run time** after a clean publication.
**Commit:** `4d4cfc1`.

Version 1 minted, the run started, signed in, and halted on step 4 with
`controlAmbiguous` on `activate "Sign in"`. The step was bound `by text`.

**Root cause.** `shape()` counts how often each name occurs before choosing a
rung, and counted names **alone, across every kind of element**. The login page
has a heading "Sign in" above a button "Sign in", so the name counted twice,
`roleAndName` was refused as ambiguous, and the ladder fell past every rung to
`text` — the one Decision 15 measured as wrong most often. That binding then
matched both at run time.

**Fix.** The rung locates by role *and* name, so uniqueness is measured on the
pair. Two buttons both called "Approve" — the ambiguous-decision fixture —
still lose the rung, which the new test pins alongside it.

This is the same mistake as Defect 1, one layer down: a name is not an
identifier on its own.

---

## Defect 8 — a walk with no example typed nothing and said nothing

**Exposed by:** Run 8, prompt 2, at **run time** after a clean publication.
**Commit:** `b7c2c1d`.

The model declared `loanNumber` as a run input. No example was given, so the
walk typed `''` into the search box, pressed Open file, stayed on the list, and
recorded a step pressing the loan-number link still sitting there. A real
search navigates straight past that link, so the run halted on
`controlNotFound` at step 7.

**Verified as the author's to fix, not Orbit's:** supplying the example
produces the correct seven steps. What was wrong is that nothing said so —
Orbit knew, at the moment it typed nothing, that everything after that step was
a response to an empty box. It cannot ask beforehand, because an input is named
by the model part way through the walk, but it can say so when it happens.

---

# Defects 9–23 — found by sections A and B, runs 10 to 23

Each was found by the suite, fixed, validated against the full unit suites, and
the suite restarted from prompt 1. Listed by the commit that closed it.

| # | What was wrong | Found by | Commit |
|---|---|---|---|
| 9 | A label and its value were paired across prose, so `read the borrower name` returned the **co-borrower**. The borrower itself was offered as nothing at all. | Run 12, prompt 4 | `5188e8e` |
| 10 | `Decline file` was kept **twice**, both `changesARecord`, behind two identical branches — a run reaching that branch would decline the file twice. | Run 11, prompt 5 | `11fb8c3` |
| 11 | One branch per guarded *step* rather than per distinct condition: `Is Loan-to-value above 80?` evaluated twice, written to the record twice. | Run 12, prompts 7/11/13 | `b12b36f` |
| 12 | A labelled value longer than 60 characters was dropped, so the income analyst's note was invisible and the model bound the read to a heading instead. | Run 13, prompt 10 | `e27647a` |
| 13 | **A refused publication showed "That did not work (409)."** The blockers were computed, described in plain words, serialised, and thrown away one function short of the screen. | Run 14, prompts 4/6 | `84b6346` |
| 14 | The collector wrote `tag: 'div'` for a selector matching `div, span, p`, so a binding corroborated on a tag the snapshot had invented and the run halted with *"found a `<p>`, expected a `<div>`"*. | Run 14, prompt 10 | `b069e4a` |
| 15 | A comparison was typed by its **threshold**, so a paragraph of prose was compared to the number 1 and the run halted with `valueNotOfDeclaredType`. | Run 15, prompt 10 | `f3aa2c0` |
| 16 | The ending that leaves *before* the guarded steps published values only read *after* them, so every conditional procedure that reads while deciding was unpublishable. | Run 15, prompt 6 | `f3aa2c0` |
| 17 | **The two endings of a guarded workflow were named by a model call about absence.** A credit score of 762 was read, `below 620` correctly decided false — and the run reported *"Decline the loan due to low credit score"*. | Run 16, prompt 5 | `1a0121e` |
| 18 | Two alternatives were chained as one condition and its opposite (`at most 80 and above 80`), so the guarded path could never run and the gate caught it several steps later as an unreachable conclusion. | Run 17, prompts 7/11/13/14 | `20a0599` |
| 19 | A read declared `type: 'text'` for everything, so typing comparisons by the declared type made **794 not "at least 700"**. Every conditional agent decided the wrong way. *(A regression I introduced in 15.)* | Run 18, prompts 7/9/12 | `e1fdfc7` |
| 20 | `contains` was carried out by `compare.ts` and never offered to authoring, so a note *describing* seasonal income satisfied "is not seasonal". And a condition on a value read after the act it governs was placed behind its own branch. | Run 19, prompts 10/6 | `348e79d` |
| 21 | Dropping a condition kept the act it governed, so a $396,000 file was **referred** on the strength of not being a jumbo. | Run 20, prompt 14 | `1074530` |
| 22 | Thresholds were compared as strings, so `at most 80%` and `above 80` were not seen to contradict, and a file at 72.73% failed "above 80". | Run 21, prompt 13 | `184581d` |
| 23 | A workflow whose conditional part was dropped kept its conclusion — *"Reserves under 6 months"* against a file holding 26 — and went on publishing values whose reads had gone with it. | Run 22, prompts 11/6 | `c19b13c` |

## The pattern

Three families account for almost all of it.

**A name is not an identifier on its own** (1, 7, 9, 11, 22): the same mistake
at five layers — the author's candidate matching, the ladder's uniqueness
count, the label/value pairing, the branch chain, the threshold comparison.

**Orbit stating a rule and not enforcing it** (2, 5, 10, 21, 23): "never repeat
a step", "an act kept without its condition is worse than no act at all", "a
run reports the conclusion by name and nothing may invent one" — all written
down, all left to the model.

**Silence** (1, 4, 5, 8, 23): running out of turns, giving up after a
rejection, walking with an empty required value, dropping a clause, losing the
conditional part — each produced a draft that looked finished.

Two defects (13, 17) were of a different kind and the most serious: the product
knew the right answer and reported a different one. The publish gate described
every blocker and the screen showed a status code; the branch decided correctly
and the conclusion said the opposite.

---

# Defects 24–29 — found by section C, runs 24 to 32

| # | What was wrong | Found by | Commit |
|---|---|---|---|
| 24 | **Orbit could not reach the session-expiry page, said so, and then pressed "Approve file" on the ordinary loan screen** — publishing an agent that approves a real loan every run and reports "Approval refused due to session expiry". | Run 24, prompt 16 | `cb93de7` |
| 25 | The model had no way to say "this procedure names a page I cannot reach", so asked to open one it answered with whatever was in front of it. | Run 25, prompts 15–23 | `2fcc930` |
| 26 | A walk that never went where the procedure said still reported the procedure's outcome as its conclusion. | Run 26, prompt 16 | `813646e` |
| 27 | The "lost the thread" latch was permanent, so a `UserID`/`User ID` slip on turn one voided a correct agent eight turns later. *(A regression from 24.)* | Run 27, prompt 12 | `14637e8` |
| 28 | Equality against a 300-character paragraph — `note isNot "seasonal"` — is settled before the run begins, so prompt 10 branched past the note it was told to read. | Run 30, prompt 10 | `fd998a5` |
| 29 | A committing act refused as a repeat was recorded and not said, so the flaky-decision agent pressed Approve once, was refused the second press it needed, and reported `Decision approved` for a decision that had not gone through. | Run 31, prompt 17 | `7c04c03` |

Defect 24 is the one worth reading twice. Orbit had already told itself, one
turn earlier, that it was not where the procedure described — and then took the
single act it could not take back. Reading and typing on the wrong page are
recoverable; approving somebody's file is not.

Two of these (25, 29) are commits that mostly *add a sentence*: a vocabulary
for saying a page is out of reach, and a question where there had only been a
line on the session record. Neither changes what Orbit does. Both change what
an author is told, which is the difference between a refusal and a wrong agent.
