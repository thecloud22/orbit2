# Orbit 2.6 — start on the editor, drafted straight through

Branch `2.6/start-on-the-editor`. Canvas: *Start on the editor*
(https://claude.ai/artifact/Hk1EsiG6wjkphAAHxxm1XD), rows *Write it out* (W1–W7) and *Show it once*
(S1–S4). Built on Karthik's "go ahead and build. all yours" (2026-09-23). Recorded as Decision 21.

Two decisions arrive together here:

- **Start on the editor** (this plan). Bring In was the last page before the one page for an
  agent's whole life (procedure editor R1). A new agent now starts on the editor itself.
- **Skip the sort page** (agreed 2026-09-23, recorded by Karthik). People did not know what to do on
  the page shown after the sort ("is it done? what should I do?"). Orbit confirms the sort itself,
  drafts, and lands them on the drafted agent, showing progress while it works.

## Rules

| # | Rule |
|---|---|
| E1 | **New agent opens the editor.** `/agents/new`. Bring In's address leads there. Nothing is saved, and nothing is listed, until there is something to keep: the first words, a paste, a PDF, or a recording. |
| E2 | **The systems are picked first, on the page.** Every registered system in service is offered, and any number can be picked: the swivel chair picks two. The first picked is the one the agent was brought in against; the rest are attached as Decision 19 already allows. Orbit never suggests or adds a system (Karthik, 2026-09-23). |
| E3 | **Then: write it, paste it, drop a PDF, or show it once.** Writing by hand drafts when the author presses *Draft it*. A paste or a PDF drafts as soon as it is sorted. |
| E4 | **The name is typed in place, and may wait.** Left empty, the agent takes its first heading, or "Untitled agent"; it can be renamed on the page. |
| E5 | **No sort page, no "Confirm and draft it".** After the sort, Orbit confirms it and drafts. The record says Orbit confirmed it (`understanding confirmed`, `by: orbit`). |
| E6 | **It stops, with a plain reason, in two cases only**: the author said more is to come, or nothing in the procedure is Orbit's to do. The reason is kept on the understanding (`not_drafted`) and shown at the top of the procedure. |
| E7 | **What the sort page caught comes after drafting**, on the sentence it concerns: a line that reads like instructions is a *risk*; a rule comparing a value no step reads is a *question on that rule* (derived, never stored, so it cannot go stale), and its table is left out of the walk until it can be decided; a sentence for a person is asked whether *the run waits here* (answered by a relabel and Map changes); a wrong label is changed and mapped again. |
| E8 | **A missing example stops the walk at the step that needs it.** It used to walk the rest with the field empty and ask afterwards, so every step after it was mapped on the wrong page. It now stops there and asks for one; the answer maps from that sentence on. With no example given, the walk is told that what the procedure is given is an input, not that there are none: told "none", the first scenario run opened whichever loan the pipeline showed first, and the draft asked for nothing. |
| E9 | **Mapping is watched.** While Orbit drafts or maps, the panel's *Watching* tab shows the screen it sees now, what it just did, the sentence it is on, and a picture of every page so far. |
| E10 | **Show it once starts from the same page**, on one of the agent's web systems (the recorder watches a browser). |

Confirm before publishing stays as it is.

## Not built here, and why

- **S2–S4 of the canvas** (recording inside the editor; shown and written sentences together;
  *Show me this one*). A shown sentence's steps are what the author did, and rewording it must not
  quietly change them: that is a new rule about edits which needs its own decision, and *Show me
  this one* needs a recorder that starts where a walk left off, which it cannot. Show it once still
  opens the recording screen and lands on the editor when it is finished. Recorded in `docs/TODO.md`.
- **Holding off once drafting has begun.** "More to come" is said when pasting, or while the sort
  runs; a walk already under way is not stopped half-way.
