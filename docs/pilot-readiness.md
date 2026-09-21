# Ten things between here and a pilot

## Context

Slice 1's loop runs end to end: a written procedure becomes a draft, the draft is
confirmed, published as an immutable version, proved by a test per ending,
activated, and run against a real browser leaving verified evidence. 121 tests
pass. The question now is what stands between that and pointing it at a real
system with real people.

Three answers you gave shape this list:

- **It is for a real pilot** — so the ranking is by what stops one, not by what
  is most interesting.
- **Identity stays deferred.** No sign-in to Orbit, no roles. Criterion 14 stays
  failing and recorded. Nothing below fakes an actor.
- **The terminal matters more than the browser.** `demo/terminal-portal` is a
  real TN3270 server on port 3270 serving the same service-request lookup the
  web portal does, and `s3270 v4.5` is installed at `/opt/homebrew/bin/s3270`.

The list is ordered. 1–5 are things a pilot hits on day one. 6–10 are things it
hits in the first week.

---

## 1. A secret is typed into the page as an empty string

**The sharpest defect found, and it is silent.**

One expression in `apps/worker/src/execute.ts` decides what an `enter` step
types:

```ts
const value = ref.from === 'input' ? ctx.inputs[ref.value] ?? ''
  : ref.from === 'literal' && ref.literal.type === 'text' ? ref.literal.text : '';
```

Everything that is not an input or a *text* literal falls to `''`. Two things
land there:

- **A secret.** `{ from: 'secret', credential: ... }` is the shape the recorder
  produces for a password field and the only place the contract permits a
  secret (`values.ts:60`). The run types an empty string into the password box,
  presses on, and records the step as `ok`.
- **A number, date or yes/no literal.** Three of the four literal kinds the
  contract declares (`values.ts:31-36`) type nothing, silently.

Around it, the same hole in four more places:

- `apps/api/src/credentials.ts:36` has `decrypt`, and **its only caller is a
  test**. The worker never signs in as the registered account.
- `step.sensitive` is **never read in `execute.ts`** — verified. The field is
  screenshotted whatever it holds.
- Nothing anywhere writes `artefact.withheld = true`. The withheld path
  (`artefacts.ts:47`) is exercised only by tests.
- `credentialMissing` is in the error vocabulary and is unreachable.

Acceptance criterion 11 — *a secret never appears in inputs, outputs, events,
logs or any artefact* — is satisfied at the type level and at recording time,
and **not on the run path**. Any application behind a login, which is every
application worth piloting against, is unreachable today.

Smaller than it looks: the storage half is done and working. AES-256-GCM is
implemented, `ORBIT_CREDENTIAL_KEY` is set in `.env` and documented in
`.env.example`, and the Admin screen already writes encrypted values. What is
missing is the worker calling `decrypt`, and the care around the value once it
has it.

## ~~1b. A procedure that names the record it works on cannot be authored~~ — fixed

Was: *"Go to the site, then open the file ML-26-04502…"* discarded the whole
interpretation over `value.value: starts with a lower-case letter`.

Authoring can now emit a literal. What the model gives for an `enter` is read
three ways, in order of how sure Orbit can be: a name is the input it names; a
token shaped like data *and* written in the procedure is a literal; anything
else is turned into a name or the turn is rejected. Both halves of the middle
test are needed — "Loan Number" appears inside "enter the loan number" and is a
label, so containment alone would have typed those words into the field.

A literal fixes the agent to one record, so Orbit does the faithful thing and
asks: *"The procedure names ML-26-04502 specifically, so every run would use
it. Is that right, or is it an example of something supplied each time?"*

Refusals no longer speak in the schema's words. Each field is named in the
product's own terms and zod's message is dropped rather than appended —
keeping it was more accurate and less useful, because an author cannot tell
"expected object, received undefined" from a bug in Orbit, which is the doubt a
refusal exists to remove.

## 2. The terminal surface

Selectable in Admin, publishable, and then refused at run time: `SURFACES` in
`apps/worker/src/main.ts` has one entry. This is the payoff of the `Surface`
interface (`apps/worker/src/surface.ts`) — a second surface should be a new
file beside `surface-browser.ts`, not a rewrite.

The fixture's own warning governs the design: **drive a real emulator, never
decode the 3270 datastream**, or a misreading on Orbit's side is cancelled by
the same misreading in the fixture. s3270 is installed and speaks a scripting
protocol on stdin.

Worth doing for its own sake: the terminal portal answers the *same* procedure
as the web one, so running one written procedure on both surfaces is the
sharpest available test of Decision 5 item 9 — that a step never names a
surface.

Note: `packages/executor-x3270` and `packages/screen-mapping` are **broken
symlinks** from `demo/terminal-portal/node_modules/@orbit/`, left over from the
other project. They point at directories that do not exist.

## 3. Publication must refuse what this deployment cannot execute

`handOff`, `collect` and `forEach` are declarable, publishable, and hit the
`default:` branch at `execute.ts:237`, halting with *"A handOff step is not
executed yet"*. A terminal application does the same at the surface check.

So a version can pass every gate, be proved by tests, be activated, and be
incapable of running. The refusal belongs at publication, naming the kind or
the surface. `apps/worker/src/reconcile.ts:26` compounds it by listing
`collect` as replayable.

The design question: where does "what this deployment can execute" live so the
API knows it without importing the worker.

## 4. A hand-off reads as a failure

`waitingForAPerson` and `handedToAPerson` are in the status vocabulary
(`packages/contract/src/views.ts:16`), coloured in three screens, and **written
by nothing**. §10 is explicit that work waiting on a person is not a failure,
and today it is recorded as one.

A pilot procedure will have a human step in it. Without this, the first one
turns the run red.

## 5. The API is open

`apps/api/src/server.ts` has no authentication of any kind across 22 route
branches. Anyone who can reach the port can publish a version, activate an
agent, start runs against a real system, and read every artefact.

And it is more reachable than it looks: `server.ts:122` is
`.listen(port, ...)` with no host, so Node binds **every interface**, while the
line it prints says `http://localhost:4000`. The message describes a
restriction that is not in force.

This is **not** identity. It is a deployment secret or a local-only bind — the
smallest thing that stops the interface being world-writable, without
pretending to know who is acting.

## 6. The hazards the new portal fixtures encode

The parallel session built seven fixtures that are precisely what a legacy
application does, and the executor answers none of them:

| Fixture | What it does | What Orbit lacks |
|---|---|---|
| `SessionExpiryPage` | session dies mid-run | no expiry detection; reads as a generic failure |
| `FlakyDecisionPage` | first click errors, second succeeds | retry would commit twice — no once-only semantics |
| `SlowDecisionPage` | result absent from the DOM until it arrives | "not found" must be a wait, not a failure |
| `AmbiguousDecisionPage` | two controls, identical accessible name | defeats `roleAndName` outright |
| `ReferencePage` | mints a value that never repeats | a recorded comparison can only be a shape |
| `PipelineStatesPage` | five reasons a table is empty | an empty result is not one condition |

Non-idempotent retry is the serious one: `control.ts` retries a whole failed
run, and a step that already committed would commit again.

## 7. Nobody is told when a run fails

No notification, no alert, no subscription, no escalation anywhere in the
repo (§11, §13). A pilot fails silently until somebody opens the Runs screen.
The minimum useful version is one channel and one rule: a failed run reaches a
person.

## 8. Work only starts when somebody presses a button

`actions.startRun`, reached from `StartRun.tsx`, is the only way a run begins.
§10 names four — schedule, event, external request, agent — plus queue state
and duplicate suppression. A pilot of automation that requires a person to
start each run is not piloting the thing being sold. A schedule is the smallest
honest answer.

## 9. The runs list stops being usable on day two

`apps/api/src/runs.ts` is `ORDER BY queued_at DESC LIMIT 50` with no
parameters. No search, no filter, no paging, no grouping. The four count tiles
on `Runs.tsx` are not clickable. §3 requires a filter to apply *across the whole
set rather than the page on screen*.

There is dead code beside it, verified: `runs.ts:37` reads `run.body?.steps`,
but the query above it never selects `v.body`, so it is always `[]`. Nobody has
noticed because `server.ts:116` spreads the result and then overwrites `steps`
with a *second* query (`readRunSteps`) that does select it. Not visible to a
user; a trap for the next caller of `readRun`, and a redundant round trip on
every run page load.

## 10. The operational controls that exist but cannot be reached

Three small ones, all high value for whoever is running the pilot:

- **Pause/resume is built, tested, and has no button.** `activate.ts:86-98`,
  routed and gated in `mayStart`. The web app never reads `paused_at`.
- **The editor is withdrawn while a version is live** (`Agent.tsx`,
  `editable = !live`) — §4 asks for the opposite, and `docs/TODO.md` records why.
- **An application cannot be retired.** `retired_at` has readers in three
  places and no writer anywhere.

---

## Not in the ten, but say it out loud

- **`apps/worker/src/author.ts` is 616 lines with no test file.** It is the
  model-driven mapping — the heart of the product and the part most able to
  change behaviour silently. There is no `author.test.ts`.
- **`apps/web` has no tests at all.** Zero `*.test.tsx`.
- **Spend is reported but never capped.** §9 wants the ceiling checked *before*
  the call; `admin.ts` only displays the total.
- **Two people editing one workflow is last-write-wins.** §13 has a row for it;
  there is no revision column or optimistic concurrency.
- **A note knows which step it concerns and the screen drops it.**
  `workflow_note.step_id` is selected by the API and never rendered, so
  criterion 3's *"with a link to it"* is unmet.
- **Only `question` notes are ever created.** Assumption, exception and risk are
  in the schema and the blocker union, and nothing produces them.

---

## Four things to fix before starting any of it

Found while designing the first block, all verified, none visible to a user.
Each is cheap now and expensive once the terminal lands.

**Every version carries every registered application.** `mint.ts`'s copy has no
`WHERE` — `SELECT DISTINCT ON (a.id) ... FROM application a JOIN
application_revision r` takes the whole registry — and the worker runs against
`row.applications[0]` (`main.ts:228`). Five applications are registered today
and every published version carries exactly one, which is luck: `Underwriting`
sorts first by `a.id` and the others were registered later. The next publication
carries all five, ordered by a UUID. Register the terminal portal and a browser
workflow can take a terminal application at index 0 — refused at run time, or
driven against the wrong host. Decision 5 item 8 says a workflow names a *set*
and a step names which one; `open` steps already carry `application: name` and
nothing reads it. **This also decides whether the surface blocker in item 3 is
meaningful or a false alarm on every workflow.**

**`OpenSurface` takes a pre-built `http://` URL.** `main.ts:232` builds
`` `http://${app.addresses[0].host}` `` and hands it to the driver — a browser
assumption living outside `surface-browser.ts`, which is the one file allowed to
hold one. A terminal needs `host:port` with no scheme. The factory should take
the address record and let each driver decide what a scheme means.

**`SURFACES` lives inside `main.ts`**, which has a top-level `for(;;)`. Nothing
can import it without starting a worker, so no test can assert that the driver
table matches what publication claims is executable. It needs its own file.

**A driver that throws escapes the typed-error channel.** `fill()` and
`activate()` return `Promise<void>` with no refusal path and `runStep` has no
try/catch. A browser rarely throws mid-step; a terminal will — dropped
connection, keyboard locked in an error state — and the run would die with the
step attempt left open, recovered only by lease expiry.

Also: `demo/terminal-portal/src/portal.test.ts` is dead code. It imports
`@orbit/executor-x3270` and `@orbit/screen-mapping` through dangling symlinks
into `packages/`, where neither exists, using `vitest` while the repo uses
`node:test`, in a package with no `test` script. It reads as coverage and is
not. Its five assertions are good and belong in the terminal suite.

---

## Where to start

**1, 2 and 3 interlock and should be done together**, in that order. The
terminal surface is not useful without sign-in — a green screen asks for
credentials before it shows anything — and the publication gate has to change
the moment a second surface exists, because the set of what this deployment can
execute is exactly what it tests.

They are also smaller than they read. The `Surface` interface is nine methods
and the browser implementation is 68 lines, so a terminal driver is a file of
similar size beside it. The credential half of sign-in is already built and
keyed; what is missing is the call.

### Verifying that first block

The fixtures make this checkable without a real system:

- `demo/terminal-portal` is a TN3270 server binding `127.0.0.1:3270`, with
  `startTerminalPortal()` exported so a test starts one in-process. It already
  has three test files of its own.
- It serves **the same procedure** as the web portal — look up a service
  request, get status and assigned team, or `REQUEST NOT FOUND`. So the
  end-to-end proof is: bring one written procedure in, publish it against the
  terminal application, and run it, then do the same against the browser
  application, and show both runs reach the same named conclusion from the same
  steps. That is Decision 5 item 9 demonstrated rather than asserted.
- For sign-in: a run against a credentialed application, then grep every
  `run_event`, `artefact`, `model_call` and log line for the secret value. The
  test should assert its absence, not its handling.
- For the publication gate: publish a version containing a `handOff`, and a
  version naming a terminal application on a deployment without the driver.
  Both must be refused at publication, naming the kind or the surface.

### One thing to decide before starting

`s3270` is a child process holding a live TCP session. That is a different
lifetime from a browser page: a run that halts must close it, the reconciler
must be able to find one whose worker died, and the two-hour recording lease
has no equivalent here. Worth settling how a terminal session is owned before
writing the driver, not after.
