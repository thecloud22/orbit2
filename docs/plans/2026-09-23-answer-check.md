# Orbit 2.4: a refused change is said

**Status:** asked for on 2026-09-23. Karthik: "1 is fine", then "item 1 proceed". Built on the
branch `2.4/answer-check` and merged to main on 2026-09-23 ("commit and merge"). §9 logs every decision taken
while building.

## 1. Why

A run counted a record-changing press as done once the screen settled. Scenario 13's first run on
the mainframe (2.3) reported ML-26-04488 *approved* while MVS had answered ATTACH PMI and APPROVE
with `LSV206E` and left the loan unchanged. The twin always accepted, so this had never surfaced.
The runner caught it only by reading the loan file back from MVS (`readLoans()`). Orbit itself
still said success.

This is item 1 of two: the green screen. Item 2, the web, is still being designed.

## 2. What was built

**The host's answer, without a model** (`apps/worker/src/tn3270/screen.ts`, `answerOf`). After a
key, the connector compares the screen before it with the screen after it:

| What the screen shows | The answer |
|---|---|
| A message whose letter says it was not done: `E`, `S`, `T`, or `A`/`D` (it asks for something first). The newest message counts: one this key wrote, else any still showing. | refused, in the host's words |
| Nothing changed at all | refused: the host answered the key and did nothing with it |
| Anything else: a new screen, or a message ending in `I` or `W` | accepted, with the message if there is one |

A message is an IBM message ID at the start of a field: a three-letter prefix, a number, and a
severity letter (`LSV206E`, `IKJ56700A`, `IEF236I`). A screen code (`LSV20`), a loan number, or a
CICS message with no letter (`DFHAC2206`) is not one.

**The session says it** (`session.ts`): `press` returns the answer. The run surface and the walk
pass it on. The browser returns nothing, so web runs behave as before.

**The run stops on a refusal** (`execute.ts`). This applies only to a press marked
`changesARecord`, and only where the surface could tell. The step halts with a new error kind,
`changeRefused`, in the application's words:
*Servicing did not accept APPROVE: it answered "LSV206E LOAN ALREADY APPROVED". Nothing was changed
by this step.* The press is neither a change nor *unknown* in the part-way record, because nothing
changed. The `activated` event now carries `answer` and `said` for every press the surface could
judge. Contract `failures.ts` and migration 0031.

**The walk records it** (`author.ts`). If the host accepts a record-changing press, its words
become the step's `then` ("the application answers "LSV205I LOAN APPROVED""). If it refuses one
while the agent is being built, that becomes a question on the step: the rest of the walk was
mapped on the screen the refusal left.

**The run page** says what a refusal means: the application said no, asking again asks the same
question, so there is no retry.

**Tests.**
- `screen.test.ts`: 5 tests on three LSV20 screens captured from KICKS (before PF5, after it, after
  it again).
- `surface-across.test.ts`: 3 executor tests: a refusal after an accepted change; a lookup answered
  "not found" is a path, not a refusal; an unchanged screen.
- `tn3270.test.ts`: approve twice on the twin over real TN3270.
- Scenario 13: the same loans run a second time without reloading. The host refuses what is already
  done, each run stops `changeRefused`, and the loan file is unchanged.

## 3. What it cannot see

- An application whose messages carry no severity letter ("RECORD NOT UPDATED") is judged only by
  whether its screen changed.
- A procedure that expects a refusal ("if the loan is already approved, say so") cannot branch on
  one: the run stops at the press. A person reads why.
- A press compiled from a rule table (ATTACH PMI in scenario 13) is not pressed by the walk, so its
  `then` keeps the default wording. Only the description is affected: a run judges that press like
  any other.
- The web. Item 2.

## 4. Results

Scenario 13 on the mainframe, both rounds: `all passed`. Round one: 957D0B and A37ED5 approved,
040E77 not found, and MVS holds 04488 APPROVED with PMI and 04471 APPROVED. Round two, without
reloading: D58153 stopped at ATTACH PMI and 4385A0 at APPROVE, each with `changeRefused` and *"did
not accept …: it answered "LSV206E LOAN ALREADY APPROVED""*. E075D3 was still not found, and MVS is
unchanged. The walk's APPROVE step now expects "the application answers "LSV205I LOAN APPROVED"".
Unit tests: 425, 423 passing and 2 skipped (the live-host tests, which pass with `ORBIT_TK5` set).

The default suite, scenarios 1–12, as a person runs them: 1–5 and 8–12 passed. Scenario 6 failed
because of a table defect unrelated to this change (§9 item 9), and passed on rerun after the fix,
with PMI attached to both condominiums: the value arrived as "a condominium" again and was
compared as "condominium". Scenario 7's not-found loan failed on a Playwright `page.screenshot`
timeout, and 7 passed in full on the same rerun.

## 9. Decisions taken while building, without asking

1. **Refusal letters are E, S, T, A and D. I and W mean it was done.** This is IBM's convention:
   W is a warning after which processing carried on, and A and D ask for an action or a decision
   before anything is done. A key that changes a record and is answered with a request has not
   changed it.
2. **One kind, `changeRefused`, for "said no" and for "did nothing".** Both get the same response:
   a person reads what the host showed, and nothing is retried. The description says which it was.
3. **Only a press marked `changesARecord` is judged.** An inquiry answered `LSV102E NO LOAN MATCHES`
   is how the procedure's "not found" ending is reached. Judging every key would halt it.
4. **The newest message decides.** A message this key wrote counts over one left from before. If the
   key wrote none, whatever is still showing counts. A second PF5 on a screen already saying
   `LSV206E` is still a refusal, not "unchanged".
5. **A refused press is not "unknown".** The host answered it, so nothing is held until a person
   checks (C15). It is not retryable (`RETRYABLE` is unchanged).
6. **A keyboard left in an error state after a press stays `terminalKeyboardLocked`, as in 2.2.** The
   key may not have reached the host, so a record-changing press there is still recorded as unknown.
7. **A refusal during the walk is a question, not a stop.** The walk carries on so the author sees
   the whole draft, and the question blocks publication until it is answered.
8. **Scenario 13 proves it by running its loans twice**, the second time without reloading the
   files. The twin cannot show it across runs, because each session starts fresh. The twin test
   approves twice in one session instead.
9. **A rule table's text value drops a leading "a" or "an"** (`decide.ts`, `withoutArticle`). This
   is a defect found by the full-suite rerun, and it is unrelated to the answer check: web runs take
   the old paths. Scenario 6's table compared Property type with "a condominium", the page said
   Condominium, and two condominiums over 80% LTV were approved without PMI. The rule extraction
   had kept the sentence's article this time; in 2.3's run it had not. It is the text counterpart of
   `withoutUnit`. "The" is kept, because it begins names, and a lone "A" is a value.
