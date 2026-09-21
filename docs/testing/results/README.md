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

The suite starts as Section A and grows a section at a time. Every defect
restarts it from prompt 1 of the suite as then defined.

| Runs | Suite | Outcome |
|---|---|---|
| 1–9 | A (1–4) | eight defects, one per run; prompts 1 and 2 passing by run 9 |
| 10 | A | green — all four pass or refuse clearly |
| 11–22 | A+B (1–14) | fifteen more defects |
| 23 | A+B | green — see `run-23.md` |
| 24–31 | A+B+C (1–23) | six more defects |
| 32 | A+B+C | see `run-32.md` — 17 of 23 pass or refuse clearly |

Defect-by-defect detail, with root cause, fix, commit and restart
confirmation, is in `defects.md`. Per-run detail is in `run-NN.md`;
screenshots under `run-NN/`.

**30 defects found across the first 23 of 50 prompts. 15 of the fixes are on
this branch; 15 are held on `held/design-changes` as design changes rather
than defect fixes — see the end of `defects.md`.**
Unit tests went from 156 to 191 (`author.ts` and `snapshot.ts` had no test
files at all before this; they have 25 and 9 now).

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

## The screenshots

Every run was screenshotted, and those pictures are no longer here. There were
2,405 of them and they came to 320MB, which made cloning this repository cost
five times what installing it does — and the point of a test record is the
finding, not the pixels it was found in. What is written in these files is the
evidence meant to last: the prompt, what was expected, what happened, and for
each defect its cause and the commit that fixed it.

They are recoverable. They were tracked up to `319fee0`, so any of them can be
read back out of git history:

    git show 319fee0^:docs/testing/results/run-01/TC-01-01-form.png > /tmp/x.png

A future run will write into `docs/testing/results/run-NN/` as before. That
path is now ignored, so the pictures stay local to whoever ran it.

