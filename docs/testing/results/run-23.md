# Run 23 — Sections A and B (prompts 1–14)

**Commit under test:** `c19b13c`. **Model:** `gpt-4.1-mini`.

Each prompt authored through `/bring-in` → Write it out, confirmed, published
and run. Judged against the seeded loan data in
`demo/mortgage-portal/src/data/loans.ts`, not against the conclusion's wording.

| # | Loan | The deciding fact | Expected | Reached | |
|---|---|---|---|---|---|
| 1 | — | — | signs in, reaches the pipeline | `Sign in successful` | PASS |
| 2 | 04471 | — | opens the file | `Loan file opened` | PASS |
| 3 | 99999 | absent | reports no match | `File Found` | LIMITATION |
| 4 | 04570 | — | reads three values | refused at publication | PASS (refusal) |
| 5 | 04471 | FICO **762**, floor 620 | approve outright | `Approved — otherwise` | PASS |
| 6 | 04547 | FICO **596**, FHA floor 580 | approve | `Approve loan — otherwise` | PASS |
| 7 | 04488 | LTV **92.09%** > 80 | attach PMI, approve | `Approve with private mortgage insurance — when Loan-to-value above 80` | PASS |
| 8 | 04513 | flood zone **AE** ≠ X | attach flood insurance | `Attach flood insurance condition — when FEMA flood zone not X` | PASS |
| 9 | 04529 | DTI **47%** > 43 | refer to a senior underwriter | `Refer to senior underwriter — when Debt-to-income above 43` | PASS |
| 10 | 04502 | note is seasonal | attach tax returns, approve | read only; conclusion names both acts | RESIDUAL |
| 11 | 04561 | reserves **26** ≥ 6 | no reserves condition | `Finish — what this concludes has to be said…` | PASS (honest) |
| 12 | 04534 | FICO **794**, jumbo floor 700 | approve | `Approve the file — when Credit score at least 700` | PASS |
| 13 | 04471 | LTV 72.73 ≤ 80, DTI 28 ≤ 43 | approve outright | `Finish — what this concludes has to be said…` | PASS (honest) |
| 14 | 04488 | amount **$396,000** ≤ $806,500 | do not refer | `Decide the loan directly — otherwise` | PASS |

Eight of the ten conditional procedures in section B now branch on the right
side of their threshold and reach the conclusion the loan data implies.

## The three that are not plain passes

**Prompt 3 — a limitation, recorded.** The page says *"No file matches that
loan number."* in a sentence. Orbit reads labelled figures and table cells; a
sentence has no stable name, and a read bound to its own text is refused by
design as circular. Separating two conclusions by absence needs a value read on
the *other* path, which a walk that follows one path never sees. So the agent
searches and reports, without confirming the message. Same cause as prompt 1's
uncounted files.

**Prompt 4 — a refusal, and a good one.** Nothing on the loan page labels the
borrower's name: it is a span inside the subtitle, beside the co-borrower and
the address. The model bound the read to the nearest panel heading, and the
publish gate refused it by name:

> Step 7 finds "borrowerName" by looking for "Borrower & employment" — the
> value it is supposed to read. It can only ever report what it searched for,
> and will find nothing the day the page says something else. Name what labels
> the value instead.

**Prompt 10 — residual.** The walk read the analyst's note, said it was
finished, and the conclusion it was given names two actions — attach the
condition, approve — that no step performs. Nothing is hidden: the run page
says *"It changed: Nothing. This version has no authority to write."* beside
it, and an author confirming eight read-only steps under that name has it in
front of them. But Orbit does not notice the gap itself, and comparing a
conclusion's prose to what the steps do would be guessing rather than
verifying. Left open.

## Prompts 11 and 13 — refusing to guess between alternatives

Both describe two alternatives ("if over 80% do this, if 80% or under do
that"). Orbit follows one path, so it cannot record both, and chaining the
conditions from each produced a guarded path that could never run. It now says
so, drops the acts those conditions governed, and leaves the conclusion for the
author to name — rather than reporting a business fact it never established.
Prompt 11 previously ended `Reserves under 6 months` against a file holding 26.
