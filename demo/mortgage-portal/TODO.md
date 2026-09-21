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

- [ ] **Loan application intake** — a multi-step form (borrower/co-borrower,
      employment & income, assets, property, loan program) that creates a new
      file and drops it into the pipeline. All 9 loans today are pre-seeded;
      there is no way to originate one. Biggest single win for input
      diversity: currency fields, SSN-style masked input, dropdowns, radio
      groups, date pickers, add/remove co-borrower rows.
- [ ] **Document checklist / stipulations tracker** — pay stubs, tax returns,
      bank statements, appraisal, each with a status (needed → received →
      reviewed → cleared) and a due date. Different shape from the existing
      "conditions" buttons: per-item state transitions and a completion gate
      ("can't approve until required docs are cleared").
- [ ] **Automated underwriting run (AUS simulation)** — a "Run AUS" action
      that reads the file's existing figures (LTV, DTI, credit score,
      reserves) against program-specific rules and returns Approve/Eligible,
      Refer, or Ineligible with findings.
- [ ] **Rate lock / pricing** — pick a rate/term from a sheet, lock it, see a
      lock-expiration countdown (pairs with the session-expiry fixture
      already built). Real-time computed fields: APR, points, monthly P&I
      recalculated as inputs change.
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

- [ ] Program-specific eligibility (FHA minimum credit score, VA no-PMI,
      jumbo minimum reserves) surfaced as pass/fail chips rather than left
      implicit in the branch-matrix test.
- [ ] PMI requirement/removal logic tied to LTV crossing 80%, shown as a
      computed flag rather than a manual condition button.
- [ ] Ability-to-repay / DTI hard-stop above a threshold (blocks approval
      outright rather than just flagging).
