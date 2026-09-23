# Orbit 2.2 — the green-screen connector, and the swivel chair

**Status:** approved to build, 2026-09-23 (Karthik: "Go ahead. Build it."), after the mockups in the
canvas row *Orbit 2.2 — the green-screen connector* and *web and mainframe in one run*. Built on the
branch `2.2/connectors`; main is not touched until every rule below holds and the nine existing
scenarios pass unchanged. §9 logs every decision taken while building.

## 1. Why

The swivel chair is a core use case: a person reads a web system, re-keys what it says into a
mainframe green screen, and brings the answer back. Orbit drives web applications today. This adds
TN3270 green screens as a second **connector**, and runs that span both.

TN3270 is the protocol in scope (RFC 1576, with TN3270E, RFC 2355, and TLS). IBM i 5250 and
character terminals are not.

## 2. Rules

**The connector boundary**

- **C1.** Everything that knows what kind of screen it is touching lives in one connector. A
  connector owns six things: registration, looking (while an agent is built), acting, finding a
  thing again at run time, evidence, and its named failures. Orbit's core — the step kinds, the
  contract, the sort, the editor, rules, the DataStore, versions, runs and the run page — never
  learns which connector it is talking to.
- **C2.** Today's browser code moves behind the boundary first, with nothing it does changed. The
  proof is the nine scenarios and every unit test passing unchanged: the same drafts, and the same
  buttons pressed on every loan. No terminal code lands before that holds.
- **C3.** A connector is chosen once, on the application, when it is registered. A workflow never
  says which. The same written procedure attached to a web application and to a green screen
  drafts to the same business acts.
- **C4.** A worker without a connector's prerequisites (s3270 for TN3270) behaves exactly as today.
  Such an application can be registered; publishing an agent for it is refused, naming the missing
  connector.

**The TN3270 connector**

- **C5.** Orbit never decodes the 3270 datastream itself. It drives the s3270 emulator (the x3270
  family), one child process per session, over a private stdin/stdout pipe. The practice host and
  the connector therefore cannot share a misreading.
- **C6.** Looking: the screen's fields and their attributes become the numbered list the model sees
  — a protected text ending in a label is a label; an unprotected field is a field, named by the label
  before it; a protected value after a label is a value; each entry on the key line
  (`PF5=APPROVE`) is a key. The screen's identity is its code and title.
- **C7.** Acting: type only inside an unprotected field (never on its attribute byte); press Enter,
  PF1–PF24, PA1–PA3 or Clear; settled means the keyboard is unlocked and the host has answered. A
  locked keyboard is a named failure, never retried blindly.
- **C8.** Finding it again (Decision 18): a terminal binding names the screen's identity, the label,
  and the row, column and length. At run time the screen must be the one mapped, the label must be
  found exactly once, and its address must agree. Anything else is a refusal, never a guess.
- **C9.** Evidence: the screen as text at every step, rendered as an image with the field boxed. A
  sign-on screen keeps its title and nothing typed into it; a non-display field is never read.
- **C10.** Named failures: connection refused (`applicationUnavailable`), timed out (`timedOut`),
  a screen other than the one mapped (`terminalScreenUnexpected`), not found or not once
  (`controlNotFound`, `controlAmbiguous`), keyboard locked (`terminalKeyboardLocked`, new).

**Runs across applications**

- **C11.** An agent may be attached to several applications. Each sentence of the procedure that is
  work is tagged with the application it happens on; Orbit proposes the tag when it sorts, the
  author changes it like a label.
- **C12.** A run holds one session per application, opened when first needed and kept for the whole
  run. Each step goes to its application's connector; moving between systems is not a navigation.
- **C13.** A value read on one system and typed on another is the DataStore's, as an object. A code
  the two systems spell differently (the web's *Conventional*, the green screen's `CONV`) is asked
  once and kept on the agent as a small table; a value with no entry halts, it is never passed
  through.
- **C14.** Nothing spans two systems as one transaction, and Orbit never guesses a reversal. A run
  that stops part-way says what each system now holds: what was changed, what was not, and what is
  unknown.
- **C15.** A run that pressed a record-changing key or button and never saw what came of it is never
  run again blind: retry and re-run are held until a person says the system has been checked.

**The practice systems**

- **C16.** The practice green screen becomes a loan-servicing twin of the web portal, over TN3270,
  serving the same nine seeded loans: sign on, inquiry, loan detail, conditions, boarding, and a
  borrower's existing loans. The service-desk practice host it already contains stays as it is.
- **C17.** The web portal gains only what the swivel chair needs — a place to record the servicing
  account on a file — and nothing that changes a page the nine scenarios walk.

## 3. Draft Decision 18 — green-screen bindings and terminal sessions

Recorded in `docs/decisions.md` when built. In short: a terminal binding is `{connector: 'tn3270',
screen, label, row, column, length, what}`; resolution checks the screen, then the label, then the
address, and refuses on any disagreement (Decision 12's exactness, for a screen). A terminal
session is owned by the run that opened it: opened on first use, closed when the run ends however it
ends, never shared or pooled; a worker that dies takes its s3270 children with it (the pipe closes),
and the reconciler's existing lease sweep covers the run.

## 4. Build order

| Step | What | Done when |
|---|---|---|
| **P1** | The connector boundary; the browser moved behind it (C1–C4) | Nine scenarios and every unit test pass unchanged |
| **P2** | The TN3270 connector and the loan-servicing twin (C5–C10, C16); Admin registers a terminal application; publication refuses a missing connector | Scenario 10: scenario 9's words, attached to the green screen, draft, publish and run to the same conclusions |
| **P3** | Runs across applications (C11–C15) | Unit tests for routing, codes, partial completion and the held re-run |
| **P4** | The swivel chair (C17): existing-loan check, then board the approved loan | Scenarios 11 and 12 pass as a person runs them; all twelve pass together |

## 9. Decisions taken while building, without asking

| Date | Decision | Why |
|---|---|---|
