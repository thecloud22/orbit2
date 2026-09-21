# mortgage-portal — testing features

Fixtures that make an acceptance criterion reproducible on demand, the way
`demo/README.md` describes the whole `demo/` directory. Each one lives on its
own route, separate from the pipeline/underwriting/login pages a recorded
workflow actually runs against, so the core app's behavior never changes
underneath an existing recording.

## Building now

- [x] **Session expiry mid-run** — `/underwriting/session-expiry?loan=`.
      A session badge flips from active to expired after a delay
      (`?expiresIn=ms`, default 8000). A decision submitted before expiry
      commits normally; one submitted after is refused with an explicit
      expired state instead of silently succeeding or hanging.
- [x] **A control that resolves twice (flaky/retry)** — `/underwriting/flaky?loan=`.
      The first "Approve file" click fails with a transient error and does not
      commit; the second, identical click succeeds. Proves a replayed workflow
      isn't derailed by a non-deterministic first attempt.
- [x] **List-state distinctions** — `/pipeline/states?state=`.
      One route, five states (`loading`, `error`, `empty`, `no-match`,
      `loaded`), each with its own copy and `data-testid` — pinning that
      "nothing yet", "nothing matching", "not loaded", and "could not load"
      are four different things, not one blank table.

- [x] **Ambiguous elements** — `/underwriting/ambiguous?loan=`.
      Two "Approve" buttons, same visible text and accessible name, one in a
      quick-actions toolbar and one in the file-decision panel. Resolving the
      right one takes the heading above it, not the name alone; the banner
      records which one actually fired.
- [x] **Slow async response inside the SPA** — `/underwriting/slow?loan=&delay=ms`.
      Approving shows a pending indicator and the decision banner doesn't
      exist in the DOM until the delay (capped at 10s, like legacy-portal's)
      elapses -- no navigation involved, unlike legacy-portal's POST/redirect
      delay.
- [x] **Non-deterministic content between runs** — `/underwriting/reference?loan=`.
      Approving stamps the file with a confirmation code and a decision
      timestamp that are different every run, so an assertion has to match
      their shape (`CNF-` + 6 chars, an ISO timestamp) rather than a value
      copied out of one run's DOM.

## Not built yet — testing fixtures

None outstanding.

## Not built yet — feature expansion

A fuller loan origination system, not just the mid-pipeline review screen the
app has today: more input surface (multi-step forms, masked fields, add/remove
rows) and more business rules (program eligibility, PMI, ability-to-repay),
with stubbed data throughout.

**New workflow surfaces**

- [x] **Loan application intake** — `/applications/new`. A four-step form
      (borrower/co-borrower, employment & income, property & program, review)
      that assigns a loan number, dates and unassigns the file, and drops it
      into `findLoan` for the current session. All 9 seeded loans were
      previously the only ones that existed; this is where a tenth one comes
      from. The review step shows the same rule chips (credit floor, LTV,
      DTI, conforming limit) the underwriting screen is judged against, and
      submitting hands off to the real, unmodified `/underwriting?loan=`
      review page.
- [x] **Document checklist / stipulations tracker** — `/underwriting/documents?loan=`.
      Five required stipulations plus one conditional one, each advancing
      needed → received → reviewed → cleared one step per click. Approve is
      disabled until every *required* item (not every item) is cleared.
- [x] **Automated underwriting run (AUS simulation)** — `/underwriting/aus?loan=`.
      "Run AUS" reads the file's LTV, DTI, credit score, program, and flood
      zone against fixed thresholds and returns Approve/Eligible, Refer, or
      Ineligible with a findings list. Deterministic and re-runnable, unlike
      the flaky-decision fixture — a real AUS gives the same file the same
      answer every time.
- [x] **Rate lock / pricing** — `/underwriting/pricing?loan=&lockSeconds=`.
      A rate sheet filtered to the file's program, real amortization-based
      monthly P&I per option, a lock that counts down and expires (same
      mechanism as session-expiry, different domain), and a re-lock action.
- [ ] **Decline reasons (adverse action)** — declining a file opens a
      reason-code multi-select (required, minimum one) before the decision
      commits, mirroring real ECOA adverse-action requirements.
- [ ] **Commitment letter / closing disclosure preview** — a dense, read-only
      generated document (closing costs, cash-to-close, terms) once approved.
- [ ] **File audit trail** — an append-only, read-only timeline of who did
      what and when on a file.

**Pipeline / list features**

- [ ] **Filters and sort** — by underwriter, status, program, submitted-date
      range, LTV/DTI thresholds. Combinable with the existing list-state
      fixture (loading/error/empty/no-match) instead of only a single query
      param.
- [ ] **A second persona: borrower portal** — borrower signs in, sees their
      own file status and uploaded documents only, not the underwriter's full
      view. Role-based visibility rather than everyone seeing everything.

**Rules to layer onto existing data**

- [x] Program-specific credit floor, surfaced as pass/fail chips on the
      application review step and as findings on the AUS run, rather than
      left implicit in the branch-matrix test. (VA no-PMI and jumbo minimum
      reserves are not yet separately modeled.)
- [ ] PMI requirement/removal logic tied to LTV crossing 80%, shown as a
      computed flag rather than a manual condition button.
- [ ] Ability-to-repay / DTI hard-stop above a threshold (blocks approval
      outright rather than just flagging).
