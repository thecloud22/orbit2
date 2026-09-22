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
  Loop case. Step 10 (a person reads the income note) is for a person.

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

- **One path per walk.** The walk drafts the path the example loan takes. Conditions it sees become
  branches, but a branch whose path the example never took has no steps of its own (ACTIVE_TASK,
  "A conditional path takes no action"). Bring a scenario in with a different example loan to see a
  different path drafted.
- **The second ending on `gpt-6-luna`.** The walk tends to mark the loan file as always present, so
  "no such file" may not be drafted as its own ending (plan §16).
- **The Human in the Loop step** (scenario 2, step 9) is being built now. Until it is in, that
  sentence is recorded as work for a person, not as a step that waits.
