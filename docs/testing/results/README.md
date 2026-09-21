# Testing Write It Out against docs/testing/testcases-01.md

The fifty prompts in `docs/testing/testcases-01.md`, executed through the Orbit
front end with Playwright, exactly as a person would: `/bring-in` → **Write it
out** → the Working screen → the draft → confirm → publish → start a run → read
the run page.

**Model:** `gpt-4.1-mini` (`ORBIT_MODEL`). Authoring is model-driven, so these
results are only reproducible against a stated model.
**Application:** Mortage Portal, revision 3, `localhost:4101`, signs in as
`admin` with a registered password.
**Start path:** `/login` for every underwriter prompt.

## How this was run

Three decisions, agreed before starting:

- **Growing suite.** A full fifty-prompt pass is 1.5–2.5 hours of live
  model-driven browser sessions, so restarting all fifty after every fix would
  not converge. The suite starts as Section A and grows a section at a time.
  Every defect restarts the suite *as currently defined* from its prompt 1, and
  a section is added only once everything before it is green.
- **A clear refusal is a pass.** Orbit's claim is that you can be sure it could
  not have done anything else, so refusing and saying why upholds it. A crash,
  a hang, a refusal quoting a schema path, a version that publishes and then
  fails at run time, or a run that completes with a wrong answer is a defect.
- **Judged through to a run**, not just to a draft.

## Runs

| Run | Suite | Stopped at | Defect | Fix |
|---|---|---|---|---|
| 1 | A | prompt 1 | 1 — every login page was ambiguous; the walk gave up in silence | `3e740e1` |
| 2 | A | prompt 1 | 2 — the walk typed nothing into anything | `6a088ab` |
| 3 | A | prompt 1 | 3 — the walk was never told which account it signs in as | `683a93b` |
| 4 | A | prompt 1 | 4 — a rejected turn told the model nothing | `89cd42a` |
| 5 | A | prompt 1 | 5 — "finished" and "gave up" recorded identically | `70d4028` |
| 6 | A | prompt 1 | 6 — a read bound to a heading returned the page title | `448095f` |
| 7 | A | prompt 1 (**at run time**, after a clean publish) | 7 — the ladder fell to its worst rung | `4d4cfc1` |
| 8 | A | prompt 2 (**at run time**, after a clean publish) | 8 — a walk with no example typed nothing and said nothing | `b7c2c1d` |

Prompt 1 first passed end to end in **Run 8**: published version 1, run
`F29F16` **succeeded**, 5 steps all reached, conclusion `Pipeline loaded`.

Every defect and its root cause, fix, validation and restart confirmation is in
`defects.md`. Per-run detail is in `run-NN.md`; screenshots in `run-NN/`.

## What the suite has established so far

Eight defects in the first two prompts of fifty. Six of the eight were in one
family — **a name is not an identifier on its own** — appearing at three
different layers: the author's candidate matching, the locator ladder's
uniqueness count, and the publish gate's circular-read check. Two published
cleanly and only failed at run time, which is the class the criteria were
written to catch.

The other consistent theme is silence. Before this run, Orbit could run out of
turns, give up after a rejection, walk with an empty required value, or drop a
clause of the procedure — and in each case produce a draft that looked
finished. Five of the eight fixes are Orbit saying what it could not do.

## Not defects — recorded so they are not confused with them

- **Orbit cannot read a figure stated in prose.** The pipeline page says "9
  files awaiting a decision" in a sentence. The snapshot offers labelled
  figures, table cells and headings; a sentence has no stable name, and a read
  bound to its own text is refused by design (`readIsCircular`). Prompt 1's
  third clause therefore has no step, and Orbit now says so rather than reading
  the heading instead. Giving prose a name is a design question, not a bug.
- **UW01 and its two runs predate this exercise** and could not be removed:
  `artefact` and `run_event` are append-only and the trigger refuses a delete,
  which is the guarantee working.
