# The faithful green-screen host

A real IBM operating system to test Orbit's green-screen connector against:
MVS 3.8j (the TK5 distribution) on the Hercules emulator, in Docker. VTAM, TSO,
JES2 and VSAM are IBM's own code from the 1980s, now public domain. The
loan-servicing application runs on top of them as CICS programs under KICKS, a
CICS-compatible transaction monitor for TSO.

The twin in `demo/terminal-portal` speaks TN3270, but we wrote it, so it only
behaves the way we expected. This host behaves the way IBM's systems behave,
including in ways we didn't expect. Every difference listed below was found by
running Orbit against it.

## Build it, run it

```
node demo/mvs/setup.mjs          # first time: about an hour; later: only what is missing
node demo/mvs/host.mjs start     # start it (and re-apply the terminal rules)
node demo/mvs/host.mjs stop      # shut MVS down cleanly (about four minutes)
pnpm test:scenarios mainframe    # scenario 13: scenario 9's words, on this host
ORBIT_TK5=tn3270://127.0.0.1:3272 pnpm --filter @orbit/worker test   # includes tk5.test.ts
```

You need Docker, `s3270` (`brew install x3270`) and `unzip`. Every port is bound
to 127.0.0.1:
- 3272 is TN3270;
- 8038 is the Hercules console.

The disks live in the Docker volume `orbit-mvs-dasd`, so what is installed
survives when the container is replaced.

**Sign on as `HERC02`, password `CUL8TR`.** That user's logon goes straight into
loan servicing, and signing off the application logs off TSO:

| Screen | What it is |
|---|---|
| Logon ===> | VTAM's logon screen. Type the user ID. |
| ENTER CURRENT PASSWORD FOR HERC02- | TSO's prompt. The password goes in a hidden field. |
| `***` | TSO's "there is more; press Enter". Orbit's connector passes these on its own. |
| LSV00 | Welcome: ENTER=CONTINUE (see "The first key", below) |
| LSV10 | Inquiry: LOAN NUMBER; ENTER=INQUIRE, PF4=BOARD A NEW LOAN, PF6=BORROWER LOANS, PF3=SIGN OFF |
| LSV20 | Loan detail: PF5=APPROVE, PF6=REFER, PF7–PF10=ATTACH a condition, PF3=RETURN |
| LSV40 | Board a new loan: PF10=SUBMIT |
| LSV50 | A borrower's existing loans |

The screens, keys, messages and checks are the twin's. The loans are the twin's
own too: they are generated from `terminal-portal/src/servicing-data.ts`. There
is one difference that matters. On this host **what a session changes stays
changed**, because approvals and boardings are rewritten into VSAM. Scenario 13
reloads the files before it runs (`loadFiles()` in `servicing.mjs`).

## What it proves, and what it cannot

Production will be IBM z/OS. This is its ancestor, not a copy of it.

| Proved here | Still needs a z/OS system |
|---|---|
| The TN3270 data stream from a real host: field attributes, protected and hidden fields, MDT, the cursor | TN3270E and TLS (`tn3270s://`). Hercules speaks plain TN3270 only |
| VTAM's logon screen; TSO's line-mode sign-on; its `***` pauses | RACF sign-on, CICS's CESL/CESN |
| Formatted BMS screens from a CICS-API program, including key legends and labels | CICS TS itself: a CICS region, not KICKS inside a TSO session |
| A host that unlocks the keyboard before it has finished writing | Code pages other than 037 |
| Record-changing keys that really change records (VSAM REWRITE) | z/OS's ISPF and TSO/E, which differ in detail |

## What the real host showed, and what Orbit does now

These were found by pointing the connector at this host (see
`apps/worker/src/tn3270/screen.test.ts`, whose fixtures are its screens).

1. **The keyboard unlocks before the host has written.** TSO's password prompt
   arrived after the unlock. A settled screen now means unlocked *and* quiet.
2. **Prompts are written into unprotected fields**, which is TSO's line mode.
   Only the field with the cursor is live, and it is named by the prompt
   before it.
3. **`***` pauses.** The connector presses Enter for them, so a run does not
   depend on how many broadcast messages there are that day.
4. **No key legend.** Most real screens don't list ENTER, but they all answer
   it, so ENTER is now offered wherever a screen takes input.
5. **Titles on row 0, dot leaders, bare `===>`.** The screen's identity is its
   code, else a title that stands alone on its row. Labels may end in `:`,
   `===>` or `. . .`.
6. **A first screen that needs Clear.** Hercules's banner takes no input, so
   the connector presses Clear once.
7. **A dropped connection leaves the user signed on.** TSO holds the session for
   a reconnect (`RECONLIM`), and the next sign-on is refused as IN USE. A z/OS
   TN3270 server tells VTAM when a client goes. Hercules doesn't, so
   `host.mjs` does it with three automatic-operator rules, and TSO is set to end
   a dropped session (`RECONLIM=0`).

## Defects of this host, worked around

- **The first key is lost.** Under TSO, the first key pressed after KICKS starts
  reaches it as PA2, with nothing typed. KICKS's own good-morning program
  ignores it, as its source says. So the application opens on LSV00, where the
  first key only means "continue", which is what real systems' welcome screens
  are for.
- **KICKS's STKCARDS drops a blank in column 80.** It joins cards into longer records, and a card
  ending in a space loses it, which shifts the rest of the record left. The loans load through
  `LSVLOAD` instead, a batch COBOL program compiled and run with TK5's `COBUCG` each time.
- **The COBOL compiler abends S0C4.** MVT ANSI COBOL (IKFCBL00), as it runs
  here, abends in phase IKFCBL01 with a page-translation exception on some
  programs and not others. Which ones depends on the text (comment lines,
  identifier lengths), and it is repeatable for a given text. The one-program
  version of the application hit it at every layout tried, while programs the
  size of one screen compile. So there is one program per screen, as CICS
  applications are usually written, and the build still tries a few layouts
  before giving up. Whether the fault is the compiler's or Hercules's ARM
  build is not known: the x86 build could not be tried on this machine.

## Licence

KICKS is © Michael Noel. Its licence allows it to be used here, but its
objects may not be put in a public repository. So `setup.mjs` downloads the
published distribution (pinned, and checked against its SHA-256) and installs
it. Orbit keeps the steps, never the files. The loan-servicing maps and
programs in `servicing/` are Orbit's own.

## Files

- `host.mjs`: start, stop, submit a job, run a console command, read a member.
- `tso.mjs`: a TSO terminal for the host's own setup. This is not Orbit's connector.
- `setup.mjs`: everything, from nothing.
- `servicing.mjs`: the application's build: files, mapset, programs, tables, and the clerk's logon.
- `servicing/LSVSET.bms`, `servicing/LSV*.cbl`: the application. `LSVLOAD` is the batch loader; the
  others are the four screen programs.
