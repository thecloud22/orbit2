# mortgage-portal — prompts for Orbit to author against

Fifty task descriptions, written the way an author actually types one:
plain business language, specific enough to drive a browser through, with
a definite outcome to check afterward. Each references a real loan number
from the seeded matrix (see `src/data/loans.ts`) or a fixture route built
for this portal (see `TODO.md`), so the prompt has something concrete to
land on rather than a generic instruction.

Every prompt is a fully independent scenario: none depends on state left
behind by another, and every one starts with its own sign-in, exactly as a
real session would. Underwriter-facing scenarios sign in at `/login` with
any user ID and password; the two borrower-portal scenarios sign in
separately at `/borrower/login` with a loan number, user ID, and password,
since that is a different role with its own front door.

Section B is written as conditional business rules on purpose — "if X,
do Y, otherwise Z" — because that is the shape a real underwriting
procedure takes, and it is what Orbit's `branch` step exists to represent.
The credit-score, LTV, and DTI thresholds used throughout match what the
portal's own Automated Underwriting run already checks: 620/580/700 credit
floor by program, 80/90/97% LTV, 43/50% DTI, and the $806,500 conforming
limit.

---

## A. Sign-on and the pipeline

1. Sign in to Meridian Home Lending with any user ID and password, confirm
   the pipeline loads, and note how many files are awaiting a decision.
2. Sign in to Meridian Home Lending, then look up loan ML-26-04471 by its
   loan number in the pipeline search box and open the file.
3. Sign in to Meridian Home Lending, then search the pipeline for loan
   number ML-26-99999, which does not exist, and confirm the page reports
   that no file matches rather than opening a blank one.
4. Sign in to Meridian Home Lending, open loan ML-26-04570, and read off
   its borrower name, program, and submitted date exactly as shown on the
   file.

## B. Business scenarios: decide the file the way an underwriter would

5. Sign in to Meridian Home Lending, then open loan ML-26-04471. If the
   credit score is below 620, decline the file citing a low credit score;
   otherwise approve it outright. Record which branch was taken and the
   resulting decision.
6. Sign in to Meridian Home Lending, then open loan ML-26-04547. Its
   program is FHA, so the credit floor is 580, not 620 — if the credit
   score is under that program's floor, decline with a credit-score
   reason; otherwise proceed to approve.
7. Sign in to Meridian Home Lending, then open loan ML-26-04488 and check
   the loan-to-value figure. If it is over 80%, attach the "require
   private mortgage insurance" condition before approving; if it is 80% or
   under, approve with no conditions attached.
8. Sign in to Meridian Home Lending, then open loan ML-26-04513 and check
   the FEMA flood zone. If it is anything other than "X", attach the flood
   insurance condition before making a decision; if it is "X", no flood
   condition is needed.
9. Sign in to Meridian Home Lending, then open loan ML-26-04529 and check
   the debt-to-income figure. If it is over 43%, refer the file to a
   senior underwriter instead of deciding it outright; if it is 43% or
   under, approve the file.
10. Sign in to Meridian Home Lending, then open loan ML-26-04502 and read
    the income analyst's employment note. If it describes the borrower's
    income as seasonal or otherwise unresolved, attach the "require two
    years of tax returns" condition before approving; otherwise approve
    with no extra condition.
11. Sign in to Meridian Home Lending, then open loan ML-26-04561 and check
    the reserve months figure. If reserves are under 6 months, attach the
    "require additional reserves" condition; if 6 months or more, no
    reserves condition is needed. Then approve the file.
12. Sign in to Meridian Home Lending, then open loan ML-26-04534, a jumbo
    loan, and check the credit score against the jumbo program's 700
    floor. If it clears 700, approve the file; if it does not, decline
    citing credit score, since jumbo has no exception for a marginal
    score.
13. Sign in to Meridian Home Lending, then open loan ML-26-04471 and check
    both loan-to-value and debt-to-income. Approve outright only if LTV is
    80% or under and DTI is 43% or under; if either threshold is exceeded,
    attach the matching condition (PMI for LTV) and record which rule
    applied.
14. Sign in to Meridian Home Lending, then open loan ML-26-04488 and check
    the loan amount against the $806,500 conforming limit for its
    program. If the loan amount exceeds the limit and the program is not
    jumbo, refer the file to a senior underwriter rather than deciding it
    directly.

## C. Binder-testing fixtures — the hard cases

15. Sign in to Meridian Home Lending, then open the session-expiry page
    for loan ML-26-04471 with the default expiry delay and approve the
    file before the session has a chance to expire, confirming the
    decision is recorded normally.
16. Sign in to Meridian Home Lending, then open the session-expiry page
    for loan ML-26-04471 with a 3-second expiry, wait 5 seconds without
    acting, then try to approve the file and confirm it is refused with an
    explicit expired message rather than silently succeeding.
17. Sign in to Meridian Home Lending, then open the flaky decision page
    for loan ML-26-04471 and approve the file, confirming that the first
    click shows a transient error and only the second, identical click
    actually commits the decision.
18. Sign in to Meridian Home Lending, then open the pipeline in its
    loading state and wait for it to resolve into the ordinary table,
    confirming the loading message disappears once files are available.
19. Sign in to Meridian Home Lending, then open the pipeline in its "could
    not load" state and confirm the page shows an explicit error with a
    retry action, not an empty table.
20. Sign in to Meridian Home Lending, then open the pipeline in its
    "nothing yet" state and confirm the copy says there are no files at
    all, distinct from a search that matched nothing.
21. Sign in to Meridian Home Lending, then open the pipeline in its "no
    match" state, with a search term already applied, and confirm it
    explains that nothing matched that search rather than reusing the
    "nothing yet" message.
22. Sign in to Meridian Home Lending, then open the ambiguous-decision
    page for loan ML-26-04471 and approve the file using the "Approve"
    button inside the file-decision panel specifically, not the
    identically-labeled one in the quick-actions toolbar, and confirm the
    recorded source reflects that choice.
23. Sign in to Meridian Home Lending, then open the slow-decision page for
    loan ML-26-04471, approve the file, and wait for the pending indicator
    to clear and the decision banner to appear, confirming the approval
    eventually completes without a page reload.

## D. Loan application intake

24. Sign in to Meridian Home Lending, then submit a new loan application
    for a first-time buyer named Priya Nair, conventional program,
    purchasing a single-family home in Salem, OR for $410,000 with a
    $328,000 loan amount, and open the resulting file once it is created.
25. Sign in to Meridian Home Lending, then start a new loan application,
    fill in the borrower's name and select "not enrolled" for homebuyer
    education, and try to advance to the next step without filling
    anything else, confirming the form refuses to proceed until the
    remaining required fields are filled.
26. Sign in to Meridian Home Lending, then submit a new loan application
    with a credit score of 600 for an FHA loan, advance to the review
    step, and confirm the credit-floor rule chip shows as failing before
    the application is submitted.

## E. Documents and stipulations

27. Sign in to Meridian Home Lending, then open the documents checklist
    for loan ML-26-04471, advance every required stipulation through
    received, reviewed, and cleared, and approve the file once the
    checklist confirms it is ready.
28. Sign in to Meridian Home Lending, then open the documents checklist
    for loan ML-26-04471 and try to approve the file while at least one
    required stipulation is still outstanding, confirming the approve
    action stays disabled rather than allowing an incomplete file through.
29. Sign in to Meridian Home Lending, then open the documents checklist
    for loan ML-26-04471, advance only the conditional gift-letter item,
    and confirm the file still cannot be approved because the required
    items were left untouched.

## F. Automated underwriting

30. Sign in to Meridian Home Lending, then run automated underwriting on
    loan ML-26-04471 and record whether the recommendation is
    Approve/Eligible, Refer, or Ineligible, along with any findings
    listed.
31. Sign in to Meridian Home Lending, then run automated underwriting on
    loan ML-26-04547 and list every finding it raises, including whether
    the credit score, DTI, or flood zone triggered anything.
32. Sign in to Meridian Home Lending, then run automated underwriting on
    loan ML-26-04488, note that the PMI finding appears because
    loan-to-value is over 80%, and confirm that finding alone does not
    push the recommendation to Refer or Ineligible.
33. Sign in to Meridian Home Lending, then run automated underwriting
    twice in a row on the same loan, ML-26-04529, and confirm both runs
    produce exactly the same recommendation and findings, since the run is
    meant to be deterministic rather than flaky.

## G. Pricing and rate lock

34. Sign in to Meridian Home Lending, then open pricing for loan
    ML-26-04471, select the 30-year rate with zero points, lock it, and
    record the estimated monthly principal and interest payment shown.
35. Sign in to Meridian Home Lending, then open pricing for loan
    ML-26-04471 with a 3-second lock window, lock a rate, wait for the
    lock to expire, and then re-lock at current pricing, confirming the
    countdown restarts.
36. Sign in to Meridian Home Lending, then open pricing for a jumbo loan,
    ML-26-04534, and confirm only the rate options for the jumbo program
    are shown, not the conventional or FHA rows.

## H. Decline with reasons, commitment letter, audit trail

37. Sign in to Meridian Home Lending, then open the decline page for loan
    ML-26-04547 and try to decline without selecting any reason,
    confirming the page refuses and asks for at least one; then select
    "credit score below program minimum" and decline.
38. Sign in to Meridian Home Lending, then open the decline page for loan
    ML-26-04529, select both "debt-to-income ratio too high" and
    "insufficient income for amount requested" as reasons, and confirm
    both appear in the recorded decision.
39. Sign in to Meridian Home Lending, then open the commitment letter page
    for loan ML-26-04471, generate the letter, and record the estimated
    total closing costs and cash to close it shows.
40. Sign in to Meridian Home Lending, then open the audit trail for loan
    ML-26-04471, review the seeded history, and add a new note that the
    borrower's employment was verified by phone, confirming the new entry
    appears without altering any earlier one.
41. Sign in to Meridian Home Lending, then open the audit trail for loan
    ML-26-04471, add a note, reload the page, and confirm the note is
    still there, proving the log persisted rather than resetting on
    navigation.

## I. Pipeline browse and filters

42. Sign in to Meridian Home Lending, then open the filtered pipeline
    view, filter to underwriter "R. Alvarez" only, and record how many
    files remain.
43. Sign in to Meridian Home Lending, then open the filtered pipeline
    view, filter to the FHA program, sort by credit score ascending, and
    record which loan number appears first.

## J. Borrower portal

44. Sign in to the borrower portal using loan number ML-26-04471 with any
    user ID and password, and read the plain-language status shown,
    noting that no loan-to-value, debt-to-income, or credit score figures
    appear anywhere on the page.
45. Sign in to the borrower portal for loan ML-26-04471 with any user ID
    and password, then mark the pay stubs upload as complete, confirming
    its status changes from a button to a confirmation badge.

## K. PDF

46. Sign in to Meridian Home Lending, then from the pipeline, open the PDF
    summary for loan ML-26-04529 and confirm it opens inline in a new tab
    rather than downloading, showing the loan's status, program, and key
    figures.
47. Sign in to Meridian Home Lending, then open loan ML-26-04488, attach
    the PMI condition, approve the file, then open the file as a
    form-styled PDF and confirm both the decision and the attached
    condition appear on it.

## L. Cross-loan and end-to-end scenarios

48. Sign in to Meridian Home Lending, then, for each of ML-26-04471,
    ML-26-04488, and ML-26-04547 in turn: open the file, check the credit
    score against its program's floor, decline if it fails, otherwise
    approve, and record which loans took which branch.
49. Sign in to Meridian Home Lending, then submit a brand-new application
    for borrower Marcus Webb, VA program, credit score 640, open the
    resulting file, run automated underwriting on it, and record the
    recommendation the new file receives before any human decision is
    made.
50. Sign in to Meridian Home Lending, then, for loan ML-26-04471, work
    through the full lifecycle in order: clear the documents checklist,
    run automated underwriting, lock a rate on the pricing page, approve
    the file, and finish by opening the commitment letter to confirm the
    closing costs reflect the locked rate's loan amount.
