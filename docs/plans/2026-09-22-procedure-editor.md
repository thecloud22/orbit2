# Orbit 2.1 — The procedure editor

**Status:** Approved 2026-09-22 (Decision 17 adopted), and being built on `2.1/editor`. §9 logs every
decision taken while building it without asking.

**Builds on:** `docs/plans/2026-09-22-orbit-2.1-procedure-model.md` (the sort, rule tables, the
DataStore, the chat, parts, the Human in the Loop step), `docs/step-editing.md` (the look session
and its replay), and Decisions 6, 11, 12, 14, 15 and 16.

**Design canvas:** "Orbit 2.0 — Slice 1 screens", row *Orbit 2.1 — the procedure editor*. The
chosen design is the board *Option C — the live editor*; *From scratch to a run* is the flow.
Options A and B stay on the row for comparison.

---

## 0. The problem

A person reads the same procedure on two screens (*What Orbit understood*, then the draft page),
and the draft page shows it as a list of steps rather than as the procedure. Inside that:

- Inputs are written once, when the draft is made, and cannot be changed (`docs/TODO.md`, "An answer
  to a question changes nothing").
- An answer to a question is recorded and changes nothing.
- The chat closes when the sort is confirmed, which is the moment the author first sees steps.
- Changing a word of the procedure means bringing it in again.
- Pictures of every walk turn are kept (0024), and nothing links a step to its picture.

The editor puts the procedure at the centre: one page, the author's words on the left, and
everything Orbit made of them in a panel beside it. While the agent is being written it is a live
editor: the author changes the words, Orbit maps what changed and asks when it is unsure.

## 1. The flow

```text
 0  Register the application            once, by an admin
 1  New agent                           name, application; paste, PDF, or a blank page
 ┌──────────────────── the editor: one page ─────────────────────┐
 │ 2  Orbit sorts           each new or changed sentence          │
 │ 3  Orbit asks for        "the loan number" → an input,         │
 │    examples              "give one real one"                   │
 │ 4  Orbit maps            what changed; steps and pictures      │
 │                          appear; rules become tables           │
 │ 5  Orbit asks            on the page, with its picture         │
 │ 6  You answer or edit    on the question, in the chat, or in   │
 │                          the words → back to 2                 │
 │ Ready when nothing is outstanding, every sentence is placed    │
 │ and no change is unmapped                                      │
 └────────────────────────────────┬───────────────────────────────┘
 7  Confirm                             a person attests
 8  Publish                             version N, fixed
 9  Run                                 no model; may wait for a person
10  Read the run                        the same page, what the run did
11  Change it later                     edit → the editor → version N+1
```

A model is used in 2 to 6 only.

## 2. The rules

Each rule says whether it already holds, is new behaviour within the settled design, or
**changes** settled design (and so is part of the draft Decision 17 in §6).

### The page

| # | Rule | Standing |
|---|---|---|
| R1 | **One page for the agent's whole life.** The same page from the first sentence to reading a run; only the panel and the one action change. It replaces *What Orbit understood* and the draft page. | New |
| R2 | **Your words, as you wrote them.** Every sentence is shown word for word, laid out as written: headings as headings, the author's list items with their own numbers. Orbit never rewrites them. | Holds (2.1 §2), new on screen |
| R3 | **Two numberings, kept apart.** The author's numbering stays in the text. Orbit's sentence numbers (1.15, 2.2, A.1) sit in the margin as references, because steps and tables cite them. Every sentence is shown, background dimmed, so no number is missing. A part that begins mid-sentence is marked where it begins. | New |
| R4 | **Steps never sit between sentences.** Under a sentence: its label and the values it uses and finds. Its steps open in the panel. | New |
| R5 | **A step is said from its structure, and names its element in words.** "Types loanNumber into the field labelled “Loan number”", from the step and `describeBinding`, never from text a model wrote. The element's name, role and how it is found are already in every binding; they are shown, and they outlast the picture. | New on screen |
| R6 | **Nothing that needs a person is hidden.** A question, an assumption, an unfinished step or an unmapped change is on the page, never folded away. | Holds (product rule 11), new on screen |
| R7 | **Every step shows the picture Orbit captured, small.** A thumbnail of the real capture, opening full size: the page when Orbit mapped the step, and, where the version had the step, the page when a test run carried it out, with the control boxed. Never a redrawn page. A sign-in page is withheld and says so. | New (uses 0024 and run evidence) |

### Values

| # | Rule | Standing |
|---|---|---|
| R8 | **A value is picked, or it is fixed.** Picked from a list of inputs and values found earlier, or typed as a literal. Nowhere to type `{loanNumber}` or `ltv + 1`. | Holds (Decision 14 §3) |
| R9 | **A secret is never an input and never in the DataStore.** The DataStore notes that it was given. | Holds (product rule 8) |
| R10 | **Inputs can be added, changed and removed.** Name, label, one of the value types, required, example. Removing one a step uses is refused, naming the step. A fixed value in a step can become an input ("Use an input here"). | New: `declared_inputs` stops being write-once |
| R11 | **Outputs.** Each ending says what it concludes and what it hands back, picked from values given or found. Only a value produced on every path to that ending is offered, and nothing from inside a `for each`. The DataStore is everything a run holds; the outputs are what each ending publishes from it. | Holds (Decision 14), new on screen |
| R12 | **Renaming a value carries through.** Every step, table and ending that uses it follows. Names are unique in the DataStore. Runs already made keep the name they were made with. | New |
| R13 | **Changing an example does not redraft.** The draft says which example it was mapped with. | New |
| R14 | **The run's data container is the DataStore.** Renamed from InMem. | Done (P0) |
| R26 | **Values are objects.** The DataStore, the inputs and the outputs hold objects — a `loan` with `number`, `ltv`, `creditScore` — not loose values. Each value says which object it is a field of (`of: { object, field }`); the walk proposes it and the author can move or rename it. A step still names a value by its own unique name, so there is still nothing to type (R8); a run hands its outputs back as objects. Added 2026-09-22 at Karthik's request. | New (Decision 14, amended) |

### Rules

| # | Rule | Standing |
|---|---|---|
| R15 | **Rule tables are read-only.** A table is changed by changing its sentence, so a table can never say something the procedure does not. Each table shows which steps it became. | Holds (2.1 §16) |
| R27 | **Every business rule has an identifier.** BR1, BR2… in the order the tables stand, and BR1.1, BR1.2… for their rows. The rule sentence shows it beside its label, and every step built from a rule carries it as a superscript. "BR" keeps them apart from this plan's own R-numbers. Added 2026-09-22 at Karthik's request. | New |

### Editing and mapping

| # | Rule | Standing |
|---|---|---|
| R16 | **An edit is a revision.** Changing a sentence adds a revision; it never overwrites. What it said before stays on the record, and the sentence is marked as changed since the last version, or as not in the procedure as brought in. | **Changes** 0016 ("a sentence is never edited") |
| R17 | **Numbers never shift in a draft.** An edited sentence keeps its number. A new sentence takes an author number (A.1) and says where it sits. A removed sentence is struck through, not deleted. A version freezes the numbering. | **Changes** (follows from R16) |
| R18 | **Orbit sorts and maps only what changed, when asked.** *Map changes* maps the pending sentences, replaying the draft's earlier steps to reach them. A draft with an unmapped change cannot be confirmed. | **Changes** (the walk runs once over the whole sort) |
| R19 | **A question does not hold a browser open.** Orbit maps what it can, leaves the question on the page with its picture and the candidates numbered, and stops. The answer is an edit, and a short new mapping replays to where it was. | **Changes** (2.1 §17 assumed a session that pauses for a person) |
| R20 | **Replay never presses anything that changes data.** Mapping presses a data-changing control only when the line it maps asks for it (Decision 16). Replaying the draft's earlier steps to reach a change never does: a change that can only be reached past one is refused, naming the step, and the author changes the example or leaves that part to a person. *Corrected 2026-09-22: this read "mapping never presses", which the walk has never been; see §9.* | Holds (Decision 16, Decision 17 item 3) |
| R21 | **The chat stays open until you publish.** The chat and direct editing make the same edits, and the chat's are marked as the author's words. | **Changes** (it closes when the sort is confirmed) |
| R22 | **A blank page is a valid start.** Everything typed is the author's words, sorted and mapped like any other. | New |

### Acts

| # | Rule | Standing |
|---|---|---|
| R23 | **Confirm and Publish are a person's acts.** Any edit after Confirm lapses it. | Holds (product rule 3) |
| R24 | **A model is used only in the editor.** Sorting, mapping and the chat. Nothing from Confirm on consults one. | Holds (Decision 6) |
| R25 | **Testing is a published version.** Every run names its version; to try a draft, publish version 1 and run it with the example. | Holds (product rule 4), chosen over draft runs |

## 3. The page

As drawn on *Option C — the live editor*.

- **Header.** The agent's name; the application; which version is live and its last test run.
  Two actions: *Map changes (n)* and *Confirm*, each disabled with its reason when it cannot be used.
- **Readiness strip.** Placed (sentences with a label), Mapped (changes not yet mapped), Questions,
  and what Orbit assumed. Derived from the record on every read, never stored (§4 of the spec: a
  status is computed from facts, so it cannot disagree with itself).
- **The document (left).** R2–R4, R6. Each block shows its margin numbers; under an acting
  sentence, its label, status (*changed · not mapped yet*, *1 question*, *Orbit is mapping…*,
  *Orbit assumed*) and the values it uses and finds as chips. A question sits on the page under its
  sentence, with the picture and numbered candidates beside it (R19). *Edit* opens the sentence in
  place (R16).
- **The panel (right)**, six tabs:

  | Tab | Holds |
  |---|---|
  | Steps | The chosen sentence's steps, each said in words with its element named (R5), with the small captured picture (R7) and a link to the same step in the last test run |
  | Chat | The conversation, open until publish (R21) |
  | Inputs | Given when a run starts; fixed values, each with *Use an input here*; secrets by name (R8–R10, R13) |
  | Outputs | Each ending: what it concludes and the values it publishes, chosen from a list (R11) |
  | Rules | The tables, each with the sentences it came from and the steps it became (R15) |
  | DataStore | Every value a run will hold: where it comes from, what uses it, rename (R12), and its value in the last test run |

- **After publishing** the same page is read-only for that version. **Reading a run** (flow step 10)
  shows under each sentence what the run did, and the panel shows each step's run picture and
  DataStore entry.

## 4. What changes

### Data (migrations from 0025)

| Migration | For | What |
|---|---|---|
| 0025 | R5, R7 | `workflow_step.from_turn` → the `model_call` that produced the step, so a step reaches its picture. A step made by hand or compiled from a table has none, and says so. |
| 0026 | R10–R13 | Inputs and examples become editable through edit verbs; each change is recorded as an event on the draft. |
| 0027 | R19 | `workflow_note` gains the picture (an evidence digest, or why it was withheld) and the candidates, each with the binding Orbit would use. An answer names a candidate by index; **the request never carries a binding**, as in the look session (`docs/step-editing.md`). |
| 0028 | R16, R17, R22 | `sentence_revision` (append-only: sentence, seq, text, given by author or chat, when). The current text of a sentence is its latest revision, and `procedure_sentence.text` stays as it arrived. `procedure_part` gains where an author part sits (after which sentence). A removed sentence is a revision marking it withdrawn. |
| 0029 | R18 | `sentence_mapping` (append-only: sentence, the revision it mapped, the mapping session). *Changed since mapped* is derived: latest revision later than the last mapped one. |

### Worker

- **Sort** only new and changed sentences, with their neighbours as context (as parts already do).
  Rule tables are remade when a rule sentence changes.
- **Mapping session** (R18–R20). Scoped to the pending sentences. Replays the draft's steps up to
  the first of them, following the graph (the look session's replay), refusing before the browser
  opens if a step to be replayed changes data. Walks the pending sentences, writes their steps,
  records each turn and its picture, and stops at the first question, leaving it as a note with its
  picture and candidates.
- **Chat** gains one edit: propose a revision of a sentence (R21). Checks unchanged: secrets not
  sent, addresses outside the application not sent, one message at a time.

### API

New verbs on a draft, each validated by a strict schema and gated on "does not make the draft
worse", as move and delete already are:

- `revise-sentence`, `add-sentence` (after a sentence), `withdraw-sentence`
- `map-changes`: queues a mapping session for the pending sentences
- `answer-question`: a candidate's index, or "not on this page"
- `declare-input`, `change-input`, `remove-input`, `set-step-value` (literal or a picked value)
- `rename-value`, `set-publishes` (an ending's outputs)

### Web

One page, `screens/Agent.tsx` rebuilt around the document and the panel. `screens/Understand.tsx`
is folded in at P7 and removed. The run page gains *On the procedure* beside its step-by-step view.

## 5. Build order

Each phase ships on its own and leaves the product working.

| Phase | What | Rules | Proof |
|---|---|---|---|
| **P0** | Rename InMem to DataStore | R14 | Done 2026-09-22: `apps/web/src/DataStore.tsx`, the run and draft pages, plan §11. Web typechecks. |
| **P1** | The page over today's data, read-only: the document with margin numbers; the panel's Steps, Inputs, Outputs, Rules and DataStore tabs; each step in words with its element named and its small captured picture (0025) | R1 (draft moment), R2–R7, R11 (read-only), R15 | API test that a step reaches its turn and picture digest, and that a withheld picture says why. Checked by eye through the run skill against both mortgage scenarios. |
| **P2** | Values editable: inputs, *Use an input here*, rename, outputs | R8–R13 | Unit tests per verb, including the refusals (an input in use; a clashing name; a secret as an input; a value not produced on every path). A request carrying a template string is refused by the schema. Closes the TODO item "An answer to a question changes nothing". |
| **P3** | Questions on the page, with picture and numbered candidates; answering applies the edit | R6, R19 (first half) | The binding written is byte-for-byte the candidate's; a request carrying a binding is refused by the schema. |
| **P4** | The chat open until publish | R21 | The §12 chat acceptance cases, re-run after confirmation. |
| **P5** | Revisions: edit, add, withdraw sentences; a blank-page start; sort only what changed | R16, R17, R22 | Revisions are append-only (a test that the owner cannot update one). `pnpm test:scenarios` as a person runs it. |
| **P6** | Mapping only what changed, with replay; *Map changes*; an unmapped change blocks Confirm | R18, R19, R20 | The Write It Out suite from prompt 1, and `pnpm test:scenarios` as-is. A scenario that edits a threshold and maps only that sentence. A replay that would press a data-changing step is refused before the browser opens. |
| **P7** | The sort moment folded into the page; `Understand.tsx` removed | R1 | Both mortgage scenarios brought in and confirmed from the one page. |
| **P8** | Reading a run on the procedure | R7 (run side) | Run pages for both scenarios read sentence by sentence, each step's run picture reachable. |

P1 to P4 touch no model call and no walk. P5 and P6 touch the sort and the walk, the most tuned code
in the product, so each is proved by the full suites, not by a spot check.

## 6. Draft Decision 17 — the procedure is edited in place

For approval. On approval its text moves into `docs/decisions.md` and 0016's header comment is
amended to point at it.

> **Status:** proposed. **Settles:** whether an author may change the procedure after it is
> brought in, and how Orbit follows the change.
>
> 1. **The author's words may change, by revision.** A sentence is never overwritten. An edit adds
>    a revision; the sentence as it arrived and every revision stay on the record; the current text
>    is the latest. Orbit still never rewrites a sentence: a revision is always the author's, typed
>    or asked for in the chat. (R16)
> 2. **Numbers are stable within a draft.** An edited sentence keeps its number; a new one takes an
>    author number; a removed one is withdrawn, not deleted. A version freezes the numbering it was
>    published with. (R17)
> 3. **Mapping is incremental.** Orbit sorts and maps only sentences changed since they were last
>    mapped, reaching them by replaying the draft's earlier steps, and only when asked. Replay never
>    passes a step that changes data. A draft with an unmapped change cannot be confirmed. (R18, R20)
> 4. **A question is left, not held.** A mapping session never waits for a person. It stops at a
>    question, leaving the picture and the candidates; the answer is an edit, and a new session
>    carries on. (R19)
> 5. **The chat is open until publication.** (R21)
>
> **Rejected:** overwriting sentences (it would make the draft say something nobody can show was
> written); mapping on every keystroke (a browser session and model calls per character, against a
> real system); holding a browser open for an answer (sessions expire and do not survive a restart,
> Decision 6 constraint 6).

## 7. Risks

- **The walk is the most tuned code in the product.** Scoping it to a set of sentences and adding
  replay is where regressions will come from. P6 is proved by the whole Write It Out suite and the
  scenarios, and nothing else.
- **Replay time and cost.** Every *Map changes* replays from sign-in. Seconds on the mortgage
  portal; measured in P6 on the longest scenario before it is accepted.
- **Customer data in pictures.** Pictures of customer pages are already kept for every walk turn;
  the editor shows them rather than taking more. Redaction is deferred (the amendment to Decision 4)
  and sign-in pages are withheld; that exposure is unchanged, and now visible.
- **Element names can carry customer data** (a link named after a borrower). Reads bind to what
  labels a value, not the value; an activate bound to such text is on the refused `text` rung
  without corroboration (Decision 15). Worth checking in P1 on real pages.
- **Many small revisions.** Each is a row; the page shows the latest and "changed since" once.

## 8. Open

- Whether a run's step event records the element it actually resolved to, so R5 can show the name
  bound and the name found side by side. To check in P1; add it if missing.
- Whether *Map changes* also runs by itself after a pause. Drawn as a button only.
- How an author reorders sentences. Not drawn; moving a step is still possible in the panel.

## 9. Decisions taken while building, without asking (logged as Karthik asked)

| Date | Decision | Why |
|---|---|---|
| 2026-09-22 | **R20 corrected.** It said mapping never presses anything that changes data. The walk has always pressed a data-changing control when the line it cites asks for it (Decision 16), so the rule is now about replay: replaying earlier steps never presses one, and a change reachable only past one is refused, naming it. | The plan stated something the code never did. |
| 2026-09-22 | **Mapping what changed replays everything before the first change, then maps from there to the end.** Endings and rule tables are rebuilt over the whole draft each time. | The walk builds endings and compiles the tables over the whole step list; splicing new steps into the middle of a graph with branches would be the riskier change. Replay needs no model, so it is cheap. |
| 2026-09-22 | **A re-map keeps what the author did to inputs, and replayed steps keep their pictures.** Steps after the first change are made again, so an edit to one of those (a value made an input, a renamed read) is made again by the walk. | Recorded, not hidden: the Inputs and DataStore tabs show the result, and the author can edit again. |
| 2026-09-22 | **The chat proposes a rewording and never applies one.** A "revise" answer is an offer; the author presses *Make this change*, and the revision is theirs. | Decision 17: Orbit never rewrites a sentence. Proposing is not applying. |
| 2026-09-22 | **The chat is open unless the agent is published and nobody has taken it back to editing.** *Edit for a new version* reopens it. | R21 says until publication; a published agent's draft is its attestation. |
| 2026-09-22 | **After publishing, the draft is changed by taking it back to editing**, and publishing again makes the next version. Runs of earlier versions are untouched. | Flow step 11; `back-to-draft` already allowed it. |
| 2026-09-22 | **Values are objects (R26)** and **business rules carry BR identifiers (R27)**, at Karthik's request mid-build. | Recorded in §2 and as an amendment to Decision 14. |
| 2026-09-23 | **A sort that fails on the network is tried again**, up to three times, 20 seconds apart, and model calls retry a thrown error or a 429/5xx twice (0029, `withRetry`). | A "fetch failed" had refused a draft's sort for good, and the author would have seen *Orbit could not sort this* for a fault of the wire. |
| 2026-09-23 | **Defects found by the scenarios, fixed rather than worked around:** the walk's "page stopped changing" check counted turns that pressed nothing, so a walk that read three values in a row gave up; it now compares only on the turn straight after a press. A rule-table answer with one empty table sank the whole set, and the walk then improvised the rules; an empty table is now dropped before the answer is checked. | Both made scenarios 1–3 fail. |
| 2026-09-23 | **Five demo scenarios (5–9) use only the portal's nine seeded files.** Nothing was added to the portal. | The seeded files already reach every path: first-time buyer and education, condo, FHA 596 against a 600 overlay, jumbo, self-employed, 47% DTI. |
| 2026-09-23 | **A rule compares a yes/no field with the answer the page shows.** Scenario 5's table compared First-time buyer with "first-time buyer" on a page that shows Yes or No, so no first-time buyer was ever referred. Connecting a table now also asks how the page writes each word a condition compares with; Orbit takes the page's word only for a yes/no field (the example shows Yes/No, True/False or Y/N) and records that as an assumption. Every other value is compared as the procedure writes it. A first version also accepted any rewording equal to the example's value, and turned scenario 6's "anything other than X" into "anything other than AE", the example's own zone; the full scenario run caught it. | A defect fix, not a design change: the tables were always meant to compare values read from the application. No contract or step vocabulary changed. |
| 2026-09-23 | **A second ending may be separated by the one value the rules said may be absent.** The endings answer described "no such file" without naming the value whose absence means it; the confirmed rules had marked exactly one read as possibly missing, so Orbit uses that one — also when the answer names a value the rules say is always there (scenario 8 named loanAmount; the rules had marked noteRate). With two or more possibly-missing values, it still refuses and asks. | Scenarios 5 and 8: the missing file halted instead of concluding, on a draft that already said which value it would be. |
| 2026-09-23 | **A press never goes ahead on a form that has lost what the walk typed.** Scenario 6's pictures show the loan number in the box on one turn and the box empty, with "No file matches that loan number", on the next: the page lost it in the minutes the walk waited on the model, and "Open file" ran on nothing. Scenario 8's sign-in did nothing the same way (the portal will not submit an empty form). Before a press, the walk checks what it typed since the last press and types it again where it has gone. A run types and presses back to back and never waited long enough to meet this. | A first guess — that the sign-in navigated after the two-second ceiling — was built and reverted: the evidence did not support it. |
| 2026-09-23 | **Where the rules are confirmed as tables, the tables decide, not a condition the walk puts on an act.** Scenario 7's walk put "only if the loan amount is at most $806,500 and debt-to-income at most 45%" on Approve file. The older "approve only if…" path sends a failed condition to the second ending, which was "No such loan file", so the jumbo and 47% files concluded not found and the missing-file check was never built. The walk's condition is now recorded as an assumption and not built when confirmed tables will be. | The walk is already told rule lines are "applied by Orbit from its confirmed table"; decide.ts's header says the tables hold the whole decision. Both firing was the defect. Procedures with no rule tables keep the older path. |
| 2026-09-23 | **An ending's name from the model is always one a step can hold.** Scenario 7's draft was refused whole ("The end at step 20: Orbit did not work out its summary"): two endings took the model's label with no fallback, and a step summary must be 1–200 characters. An empty label now reads "this conclusion has no name yet" and a long one is cut at a word; the person names the conclusion when confirming either way. | A draft of twenty good steps was thrown away over a label. |
| 2026-09-23 | **A negation folded into a rule's word is compared as the opposite, with the word itself.** Scenario 5's table once said education is "not completed" (another run said isNot "completed"); the page shows "Enrolled, not complete", so no first-time buyer was referred. A value beginning "not " now becomes the opposite comparison with the rest, and the tables prompt asks for it that way. | Deterministic, and it only touches a value that starts with "not ". A page value that itself starts with "Not" (the portal's "Not enrolled") could be misread; recorded in TODO. |
