# mortgage-portal — testing features

Fixtures that make an acceptance criterion reproducible on demand, the way
`demo/README.md` describes the whole `demo/` directory. Each one lives on its
own route, separate from the pipeline/underwriting/login pages a recorded
workflow actually runs against, so the core app's behavior never changes
underneath an existing recording.

`/features` is a directory of everything below -- every fixture and every new
workflow page, linked with a sample loan number filled in -- also reachable
from the "Features" tab in the header on every page.

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

## Feature expansion

A fuller loan origination system, not just the mid-pipeline review screen the
app has today: more input surface (multi-step forms, masked fields, add/remove
rows) and more business rules (program eligibility, PMI, ability-to-repay),
with stubbed data throughout. Every page below is its own route, off the real
pipeline/underwriting/login flow and off each other's nav -- reachable from
`/features`, not wired into `Shell`'s header or the file-level `FileNav`.

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
- [x] **Automated underwriting run** — `/underwriting/automated-underwriting?loan=`.
      "Run automated underwriting" reads the file's LTV, DTI, credit score,
      program, and flood zone against fixed thresholds and returns
      Approve/Eligible, Refer, or Ineligible with a findings list.
      Deterministic and re-runnable, unlike the flaky-decision fixture — a
      real automated underwriting run gives the same file the same answer
      every time.
- [x] **Rate lock / pricing** — `/underwriting/pricing?loan=&lockSeconds=`.
      A rate sheet filtered to the file's program, real amortization-based
      monthly P&I per option, a lock that counts down and expires (same
      mechanism as session-expiry, different domain), and a re-lock action.
- [x] **Decline reasons (adverse action)** — `/underwriting/decline?loan=`.
      A stricter decline than the file review's own button: requires at
      least one reason code, from a fixed ECOA-style list, before it
      commits. Kept off the file review's decision panel entirely, so the
      existing single-click decline there still behaves exactly as before.
- [x] **Commitment letter / closing disclosure preview** — `/underwriting/commitment-letter?loan=`.
      A generated, read-only document: loan terms plus closing costs (origination
      fee, appraisal, title insurance, recording, prepaid interest) computed
      from the file's own loan amount, purchase price, and note rate, down to
      an estimated cash-to-close figure.
- [x] **File audit trail** — `/underwriting/audit-trail?loan=`.
      A few seeded historical entries (generated from the file's own
      submitted date) plus a genuinely append-only log a person can add to —
      entries persist for the session and are never edited or removed, only
      added. `submitApplication` now also writes the one entry that already
      had a natural single hook: "Application submitted".

**Pipeline / list features**

- [x] **Filters and sort** — `/pipeline/browse`.
      Filters by underwriter, status, and program compose with a sort by
      submitted date, LTV, DTI, or credit score. Kept off `/pipeline` itself,
      so the existing lookup-by-loan-number flow there is untouched.
- [x] **A second persona: borrower portal** — `/borrower/login` then `/borrower?loan=`.
      A separate dummy sign-on (loan number, user ID, password, all
      required) leading to a dashboard with no LTV, DTI, credit score, or
      underwriter name — plain-language status and a document-upload
      checklist only. Its own minimal header, not the underwriter `Shell`,
      so the role difference is visible, not just enforced.

**Rules to layer onto existing data**

- [x] Program-specific credit floor, surfaced as pass/fail chips on the
      application review step and as findings on the automated underwriting
      run, rather than left implicit in the branch-matrix test. (VA no-PMI
      and jumbo minimum reserves are not yet separately modeled.)
- [x] PMI requirement, surfaced as a computed `info`-severity finding on the
      automated underwriting run when LTV crosses 80% — not yet a *removal*
      trigger, since nothing on the file tracks paid-down equity over time.
- [x] Ability-to-repay hard-stop: the automated underwriting run's existing
      DTI > 50% block finding is now explicitly labeled and IDed as the
      ability-to-repay maximum, rather than a generically named "program
      maximum".

**Documents**

- [x] **Loan summary PDF** — a "PDF" button on every row of the real
      `/pipeline` table (`src/lib/loanSummaryPdf.ts`, via `jspdf`). Generates
      and downloads an actual PDF file client-side from that loan's own
      figures -- no demo portal in this repository has triggered a file
      download before, and a recorded workflow that reads a value off a
      downloaded document is a different capability than reading one off a
      page.
- [x] **Loan file PDF, form-styled** — a "Download PDF" button on the real
      `/underwriting?loan=` file review page itself (`src/lib/loanFilePdf.ts`).
      Everything the screen shows -- underwriting summary, borrower &
      employment, property & program, the decision banner and attached
      conditions if any -- laid out as bordered, labelled boxes rather than
      run-together text, the way a printed form reads. Reflects the page's
      own live state at the moment of the click: a decision made or a
      condition attached before downloading shows up in the PDF.
