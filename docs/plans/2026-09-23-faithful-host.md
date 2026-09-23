# Orbit 2.3: the faithful TN3270 host

**Status:** asked for on 2026-09-23 (Karthik: "build the faithful TN3270 host. is hercules the
best?"). Built on the branch `2.3/faithful-host`; main is not touched until Karthik says so. §9
logs every decision taken while building.

## 1. Why

The 2.2 connector was proved against a twin that we wrote, and a twin can only behave the way
its author expected. Production will be IBM z/OS. The best free, legal stand-in is Hercules
running MVS 3.8j as TK5. It has IBM's VTAM, TSO, JES2 and VSAM, plus KICKS, a CICS-compatible
transaction monitor. IBM's own options (zD&T, Wazi) are licensed, and Z Xplore's terms don't fit
testing a product.

It is still not z/OS. What it proves and what it cannot are set out in `demo/mvs/README.md`.

## 2. What was built

**Stage 1: the connector against a real host** (`apps/worker/src/tn3270/`)

- A settled screen is unlocked *and* quiet. s3270's `Wait(Output)` asks whether the screen has
  changed since it was last read, so the screen is read before each wait.
- TSO's `***` pauses are passed with Enter, up to 20 of them.
- Line mode (every field unprotected): the live field is the one holding the cursor, named by the
  prompt before it, and it is found by what it asks, not where it is.
- ENTER is offered wherever a screen takes input and no legend names it.
- Identity: the screen's code, else a title standing alone on its row (rows 1–3, then row 0),
  else the line-mode prompt, else its first field's label, else the rule used before 2.3.
- Labels may end in `:`, `===>`, `==>`, `=>` or dot leaders. A bare `===>` is named by the text
  written over it.
- If the first screen takes no input, the connector presses Clear once.
- Tests: `screen.test.ts` (8 tests on screens captured from TK5) and `tk5.test.ts` (2 tests
  against the live host, skipped unless `ORBIT_TK5` is set).

**Stage 2: the host and the application** (`demo/mvs/`)

- `setup.mjs` builds everything from nothing: TK5 in Docker, KICKS installed as its guide says,
  RECONLIM=0, and the application.
- The application is four CICS COBOL programs, one per screen, and a BMS mapset with the twin's
  screens. The loans live in two VSAM files generated from the twin's data.

**Stage 3: scenario 13.** Scenario 9's words, against the mainframe.

## 3. Rules

- **H1.** Only defects are fixed in Orbit, and only defects that would also occur against IBM's
  hosts. A host quirk that z/OS doesn't share is handled on the host.
- **H2.** Nothing KICKS distributes is kept in Orbit's repository (its licence). The setup fetches
  the published package, pinned by commit and SHA-256.
- **H3.** The twin keeps working unchanged. Scenarios 10–12 pass on the changed connector.
- **H4.** The host is local only: every port is bound to 127.0.0.1.

## 9. Decisions taken while building, without asking

1. **TK5 on Hercules, from `praths/mvs-tk5` pinned by digest.** It is the arm64 build, because
   this Mac is arm64. It is recorded in `host.mjs`.
2. **A settled screen waits for 0.3 s of quiet after the unlock.** This adds about 0.3 s to each
   press on the twin. The twin tests take about 1 s each, as before.
3. **The connector presses Enter at TSO's `***`.** This is paging, not a step of anyone's
   procedure, and a run must not depend on how many messages TSO shows that day. The cost: text
   TSO writes before a pause is never shown to the walk. See TODO.
4. **ENTER is offered as a key named "ENTER" wherever no legend names it.** ENTER is not a
   changing verb, so whether it changes a record stays the model's call, as it is for any key.
5. **The identity rule gained steps but keeps the old one last.** Every twin screen resolves as
   before (codes, or the service desk's rows 1–3 titles), so no published binding moved.
6. **On a line-mode screen, a field is found by its prompt, not its address.** TSO writes where
   it has got to, so a prompt moves down the screen after each failed attempt.
7. **The servicing account is HERC02, and its logon *is* the application.** This uses TK5's
   `MYLOGON` hook rather than changing TSO's user records. Signing off the application logs off
   TSO.
8. **TSO ends a dropped session (RECONLIM=0), and VTAM is told when a client comes and goes**
   (three automatic-operator rules in `host.mjs`). z/OS's TN3270 server does the second itself.
   TK5's own TSOKEY00 is kept as TSOKEYTK.
9. **The application opens on a welcome screen, LSV00 (ENTER=CONTINUE).** Under TSO the first key
   after KICKS starts arrives as PA2 with nothing typed. KICKS's own KSGM ignores it. A key that
   only means "continue" is how real systems' welcome screens behave, and it loses nothing.
10. **One program per screen (LSVPGM, LSVDET, LSVBRD, LSVBOR).** The one-program version made MVT
    ANSI COBOL abend S0C4 at every layout tried, and screen-sized programs compile. The build still
    retries a few layouts before giving up, and says when it needed one.
11. **Scenario 13's example loan (ML-26-04561) is not one of the loans it runs.** The walk presses
    what it maps, and on this host an approval stays approved. The files are reloaded before the
    walk, as a test fixture, the way each twin session starts fresh. Scenario 13 is not in the
    default run, because it needs the host up.
12. **The registration uses model 3278-2 (24×80) and code page 037**, as the twin's does.
13. **Cards are joined into records by our own batch COBOL (LSVLOAD), not KICKS's STKCARDS.**
    STKCARDS dropped a blank in column 80 and shifted the rest of the record, so every loan whose
    first card ended in a space read "N UNDERWRITING" and refused every decision. LSVLOAD is
    compiled and run with TK5's COBUCG each time the files are loaded. The existing-loans record
    grew from 160 to 240 bytes, so one loader serves both files.
14. **Scenario 13 judges the runs by the loan file on MVS as well as by what they pressed.** Its
    first run passed while the host had refused both decisions, because a run does not check that
    a press was accepted (TODO). The runner now reads each loan's status and conditions back with
    IDCAMS (`readLoans()`) and fails if they are not what the procedure should have left.
15. **An early "finished" is refused up to three more times on every walk, not only across
    applications.** Scenario 13's second run typed the TSO password, pressed nothing, and called
    the procedure finished. Orbit refused once, as it always has; the model said "finished" again
    and it was taken, leaving three lines unmapped. The fix already made for this in 2.2 (a walk
    half signed on to a green screen, scenario 11) was gated to walks across applications. It now
    applies to all walks, and its message names "typed but not submitted". It changes only walks
    that would otherwise end with lines of work unmapped. The full scenario suite is rerun for it.
16. **A rule's action that begins with a changing verb must press something** (`decide.ts`). In the
    full-suite rerun, scenario 6's table came back with "attach the condition requiring private
    mortgage insurance" naming no control. It was built as a row that matched every condominium
    over 80% and did nothing, and was published with no question asked: two loans approved without
    PMI. Such an answer is now a problem: sent back to the model once, then a question for a person,
    as a control that is not on the page already is. The walk change (15) was not involved: no
    early-finish refusal fired in that walk. The first version of this check was too broad, and
    scenario 11 then failed at publication ("nothing can reach step 26"). Its "otherwise, approve
    the file" rightly pressed nothing, because the walk's own Approve step follows the table.
    Refused, the model named Approve inside the table, and the walk's step was left unreachable.
    The check now applies only when no step the walk already made does what the action asks. There
    is a test for each case, and the full suite is rerun on the narrowed check.
