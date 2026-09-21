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
