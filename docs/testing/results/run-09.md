# Run 9 — Section A (prompts 1–4)

**Commit under test:** `b7c2c1d`. **Model:** `gpt-4.1-mini`. Restarted from
prompt 1 after Defect 8.

---

## Prompt 1 — sign in, confirm the pipeline loads, note how many files await a decision

**Expected.** Signs in, reaches the pipeline, reads the count, ends on a named
conclusion — or says what it could not do.

**Actual.** Five steps: `open /login`, `The registered account, into User ID`,
`A secret, into Password`, `activate Sign in` (bound `roleAndName`), `end`. One
question:

> The last thing Orbit tried here could not be used — it gave "heading" as the
> element, which is a kind of thing rather than the name of one — and the
> procedure was reported finished straight afterwards. Check the steps below
> against everything you wrote: something it asks for may have no step.

Confirmed, published, run. Run `F29F16` (Run 8, identical draft): **Succeeded**,
5 steps all reached, conclusion `Pipeline loaded`.

**Status: PASS.** Two of the three clauses are carried out; the third — the
count, which is stated in prose the snapshot cannot name — has no step, and
Orbit says so rather than reading the heading instead. A clear refusal, in the
author's words, on a clause the application does not expose in a form Orbit can
bind to reliably.

---

## Prompt 2 — look up ML-26-04471 in the pipeline search box and open the file

**Expected.** Signs in, types the loan number into the search box, opens the
file.

**Actual.** Seven steps, no outstanding questions:

```
1 open      Open /login
2 enter     The registered account, into User ID
3 enter     A secret, into Password
4 activate  Sign in
5 enter     loanNumber, into Open a file by loan number
6 activate  Open file
7 end       Loan file opened
```

Published version 1. Run: **Succeeded**, 7 steps all reached, conclusion
`Loan file opened`.

**Status: PASS.**

Note: the example `loanNumber=ML-26-04471` was supplied on the bring-in screen.
Without it the walk searches with an empty box and records a step that a real
search navigates past — Defect 8, now reported as a question.

---

## Prompt 3 — search for ML-26-99999 and confirm the page reports no file matches

**Expected.** Signs in, searches for a loan number that does not exist, and
**reads the "no match" message** so the conclusion rests on something.

**Actual.** Seven steps, identical in shape to prompt 2, ending `File Opened`.
No step reads or checks anything. Two questions:

> The page stopped changing, so the rest of the procedure could not be worked
> out here.
>
> Orbit could not use the second conclusion it was offered, because it
> described a second conclusion without saying what distinguishes it. Is there
> more than one way this finishes?

**Status: OPEN — not yet judged.** The draft is unfaithful in a specific way:
the procedure's entire point is the check, and there is no step that performs
it. The questions raised are adjacent to the problem without naming it, and the
conclusion `File Opened` is the opposite of what the procedure describes. This
needs investigation before it can be called a defect or a limitation: the
question is whether the "no match" message is visible to the snapshot at all,
which is the same class of question as prompt 1's count.

---

## Prompt 4 — open ML-26-04570 and read borrower name, program, and submitted date

**Expected.** Three reads, each bound to whatever labels the value.

**Actual.** Nine steps, hitting the 12-turn ceiling. Two reads:

```
7 read  Adaeze Nwachukwu, into borrowerName
        structural, name "Adaeze Nwachukwu", corroborate tag=div
8 read  Loan program, into loanProgram
        structural, name "Loan program", corroborate tag=div
```

Step 8 is bound correctly — by the label. **Step 7 is bound by the borrower's
own name**, which is the value, not a label. A `structural` binding locates by
the label and reads what sits beside it, so this step reads whatever follows
the borrower name rather than the borrower name itself. The summary says
otherwise.

The submitted date is never read. Orbit does say so:

> Orbit worked through 12 turns without reaching the end of this procedure, so
> what is below is only as far as it got.

**Status: OPEN — not yet judged.** The ceiling report is correct behaviour
(Defect 1's fix). The mis-bound read is not, and needs the loan page's DOM
examined to establish whether the snapshot's label/value pairing is off by one
on that layout.

---

## Where this run stopped

Prompts 1 and 2 pass end to end. Prompts 3 and 4 have identified, documented
findings that were **not** investigated to root cause in this session, so no
fix was attempted and no restart followed. The suite is paused here rather than
declared green.
