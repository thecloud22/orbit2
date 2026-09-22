# Two mortgage scenarios for Orbit 2.1

Both run against the **Mortage Portal** application (`localhost:4101`, signs in as `admin`). Each
loan number below is seeded in `demo/mortgage-portal/src/data/loans.ts`, and the expected
conclusions follow from the figures the loan page shows.

---

## Scenario 1: Mortgage insurance and reserves, pasted in two parts

**What it exercises:** bringing a procedure in parts, cut mid-sentence; background, rule, for-a-person
and won't-do sentences; two threshold rules that each attach a condition before a decision.

**Bring it in**
1. Home → *Bring in a procedure* → choose **Mortage Portal**, start at `/login`.
2. Name it, paste `01-pmi-and-reserves.part1.txt`, and choose **More to come**.
3. Under *An example to work through*: `loanNumber` = `ML-26-04488`.
4. *Read it through*. When the sort is in, paste `01-pmi-and-reserves.part2.txt` into
   **Add the next part** and press *Sort this part*.

**What to check on "What Orbit understood"**
- The last sentence of part 1 is flagged *stops mid-sentence*, and part 2's first *may carry on from* it.
- Title, *Purpose*, the scope sentences and *Before you start* are background.
- *If it has not, send it back to processing* reads as work for a person, or as a rule; your call.
- Steps 1, 2, 4 and 7 are Orbit's; 3 and the "not an error" sentence are rules; 5 and 6 are rules;
  step 8 (phone the loan officer) is for a person; the last paragraph is Orbit won't.
- The tables show loan-to-value and reserves, each read by sentence 4.
- Try the chat: *"Also read the note rate."* (added in your words), *"Why is step 8 for a person?"*,
  *"Send the borrower an email"* (offered as work for a person), *"Check rates on zillow.com"* (refused,
  not sent).

**Loans to run once it is published**

| Loan | Loan-to-value | Reserves | Should conclude |
|---|---|---|---|
| ML-26-04488 | 92.1% | 3 months | PMI and reserves conditions attached, file **conditionally approved** |
| ML-26-04561 | 85.0% | 26 months | PMI condition only, **conditionally approved** |
| ML-26-04471 | 72.7% | 8 months | No conditions, **approved** |
| ML-26-99999 | — | — | **No such file**, and not an error |

---

## Scenario 2: Underwriting risk review, as a PDF

**What it exercises:** PDF intake with page numbers; a rule with an exception ("580 for FHA, not
620"); two referral rules; a flood rule; a wait for a senior underwriter's sign-off (the Human in the
Loop case); a judgement left to a person; prohibitions.

**Bring it in:** upload `02-risk-review.pdf` instead of pasting, with **Yes, all of it**. Example:
`loanNumber` = `ML-26-04513`.

**What to check**
- Every sentence shows *p. 1*.
- The rules as tables: credit score (with the FHA exception), debt-to-income, loan amount against the
  conforming limit, and flood zone, each read by sentence 9 (step 3). If a table compares the loan
  program and nothing reads it, that's the check working: sentence 9 lists it, so it should be read.
- Step 9 (wait for the senior underwriter to sign off, then record their decision) is the Human in the
  Loop case: it should sort as *for a person*, and you tick *The run waits here*. Step 10 (a person
  reads the income note) stays for a person, unticked.
- Run ML-26-04529 (referred): it should pause at the wait. Press *It's done. Carry on* and it resumes.

**Loans to run**

| Loan | What trips | Should conclude |
|---|---|---|
| ML-26-04513 | Flood zone AE | Flood condition, **conditionally approved** |
| ML-26-04561 | Flood zone VE | Flood condition, **conditionally approved** |
| ML-26-04529 | Debt-to-income 47% | **Referred** to a senior underwriter, no conditions |
| ML-26-04547 | FHA, credit 596 | Above FHA's 580 floor: **approved**, not declined |
| ML-26-04534 | Jumbo, $930,000 | Over the conforming limit but jumbo: **approved**, not referred |
| ML-26-04502 | Self-employed | **Approved**; the income note is left to a person |

---

## Known limits, so they aren't mistaken for new faults

- **Every path from one example.** The confirmed rule tables are compiled into branches, and each
  outcome's button is connected on the loan page, so decline, refer and approve are all drafted from
  one example loan. Check the tables before confirming: the draft does what they say.
- **Scenario 1, sentence 1.8** ("Make sure the file has been through automated underwriting") is a
  check a person makes before the review. Left as *Orbit does this*, the walk goes to the automated
  underwriting page and presses *Run*; mark it and 1.9 *For a person*.
- **"No such file"** is drafted when the procedure says what to do about a missing file (scenario 1
  does; scenario 2 does not, so 99999 halts there, correctly).
- **The Human in the Loop step** (scenario 2, step 9) is built. On the sort screen, tick *The run
  waits here until this is done* under that sentence. The walk places a waiting step there, opens the
  application again and drafts what follows. A run of it pauses as *Waiting for a person*; press
  *It's done. Carry on* on the run page and it resumes after the wait.
