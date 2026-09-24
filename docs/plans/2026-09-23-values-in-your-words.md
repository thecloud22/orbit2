# Orbit 2.5: values named in your words

**Status:** asked for on 2026-09-23. Karthik chose option 4 of the rules-editing sketches ("4 is the
closest to the users"), then "Let's build it. go ahead" and "Commit. Merge and then go ahead."
Built on the branch `2.5/values-in-your-words`, held for review because it adds a record and changes
what the tables, the walk and the compile trust, then merged to main on 2026-09-23 ("merge it"). The sketch
is the "Rules Panel Editing" canvas, boards 4a–4c. §9 logs the decisions taken while building.

## 1. Why

A rule reaches the value it compares through three names and two guesses, none of which the author
sees:

| | Name | Given by |
|---|---|---|
| The author's words | "the loan amount" (1.14) | the author |
| The table's column | `loanAmount`, read by 1.9 | a model, when the tables are made (`tables.ts`) |
| The value the walk read | `loanAmount`, step 10 | a model, during the walk |
| Which read value the column is | `loanAmount` → `loanAmount` | a model, when the table is compiled (`decide.ts`), checked only to be *a* value read |

Scenario 6's condominium defect lived in this chain. Karthik asked for a way to reference variable
names in rules ("insert {BR1} here?"). Typing tokens into the procedure was rejected: the words stay
the author's, and a person handed a step reads them. Pointing at a rule number was rejected too: a
sentence already is its rule. What is wanted is a way to say *this phrase is that value*, where the
author already works: in their sentences.

## 2. What it is

A **value link**: a phrase of one sentence, and the value it means. It is given by the author, or
shown as Orbit's guess.

- **V1: Orbit's guesses, shown in the words (4a).** After the sort, each phrase Orbit takes to be a
  value is underlined, dotted, with the value's name beside it. The guesses are worked out with no
  model, from what Orbit already holds: each table column's label found in its rule sentences
  (the column's name), and each read step's label found in the sentence it carries out (the value
  it produces). A guess is never used as an author's word.
- **V2: The author confirms or changes one (4b).** Clicking an underlined phrase offers the values
  the walk read, the inputs, a new value, and "Not a value". A link the author gives is underlined
  solid. "Not a value" is kept too, so the guess is not shown again.
- **V3: Or names one while writing (4c).** In the Edit box, typing `@` offers the same values. The
  choice is written into the sentence as the value's own words ("the credit score"), and the link is
  kept beside the sentence. The sentence never contains `{creditScore}` or an `@`.
- **V4: The words are never changed by a link.** A link is its own append-only record
  (`value_link`, 0032), like a label or an application placement. It is current only while its
  phrase is still in the sentence exactly once. A revision that drops the phrase drops the link,
  with no rewrite and no model.
- **V5: A link decides the column's name.** When the tables are made, the author's links in rule
  sentences are shown as fixed: a column for a linked phrase is named the linked value. A set of
  tables in which a linked value has no column in the table citing its sentence is refused, with the
  problem named, and made again, as any other table problem is.
- **V6: A link decides which value a column is.** When a table is compiled, a column the author
  named is the read value of that name, and the model is not asked. If no step reads it, the table
  is not compiled, and a question says so.
- **V7: A link tells the walk what to call a value.** The walk is shown the author's links in the
  lines it carries out, and names a read with the linked name. If the walk finishes and a value the
  author named in a line of work was not read under that name, a question says so. It is left, not
  held (Decision 17 item 4).
- **V8: A link is a change.** It sends the rule tables back to be made again (as a relabel does),
  lapses a confirmation, and leaves its sentence waiting to be mapped.

## 3. What it is not

- Not a rule reference. `BR` numbers are kept (merged to main as `fix/kept-rule-numbers`) and are
  shown, never typed.
- Not an expression. A link names a value, and a step still names a value. Nothing is evaluated
  (product rule 13).
- Not a binding. A link never names a field or a control on the page (Decision 12). It says what a
  phrase means, and the walk still finds the value on the page.

## 4. Rules

| Rule | |
|---|---|
| L1 | A phrase is linked only if it is in its sentence exactly once. If it is there twice, or not at all, the link is refused and the refusal says which (product rule 12). |
| L2 | A value is a camelCase name (the contract's `name`). A new name is allowed: the walk is told to read it. |
| L3 | Only a task or a rule sentence takes a link. Nothing is read or compared anywhere else. |
| L4 | The author's link outranks Orbit's guess for the same phrase, and for any phrase overlapping it. |
| L5 | Links are refused while Orbit is sorting or mapping, as every edit is. |

## 5. Schema: 0032

`value_link (id, seq, sentence_id, phrase, value NULL, given_by 'author', created_at)`: append-only.
`UPDATE` is refused by trigger and `DELETE` is not granted. The current link for a (sentence,
phrase) is the latest row, and a null `value` means "not a value". Orbit's guesses are not stored:
they are derived, like `pending`.

## 6. Interfaces

- `POST /api/workflows/:id/link-value` `{ sentence, phrase, value | null }`, or `{ links: [...] }`
  for several as one change.
- `revise-sentence` and `add-sentence` take `links: [{ phrase, value }]`, kept in the same change.
- The draft gains `links: Array<{ sentence, phrase, value, by: 'author' | 'orbit' }>` (current
  author links, then guesses not overruled).
- The walk's options gain `named`. `compileTables` gains `named` (the value names the author linked
  in rule sentences). `tabulate` and `checkRuleTables` gain the author's links.

## 7. Tests

The contract finds a phrase and works out guesses. `checkRuleTables` refuses a linked value with no
column. The API refuses a link to a phrase that appears twice or not at all, a link on a background
sentence, and a bad name. A revision that drops the phrase drops the link. The compile uses an
author-named column without asking the model, and says so when nothing reads the value. The walk is
shown the names. After that, `pnpm test:scenarios` runs as a person would.

## 8. Order

1. 0032, and the contract (phrase finding, guesses, the check).
2. The API: the record, the draft's `links`, pending.
3. The worker: tables, compile, walk.
4. The web: 4a, 4b, 4c.
5. Docs: Decision 20, TODO (what main lacks without this branch), ACTIVE_TASK.

## 9. Decisions taken while building

1. **Orbit's guesses need no model.** A guess is a read step's label, or a table column's label,
   found at word edges in the sentence, exactly once, with a leading "the" taken along. A read
   outranks a column for the same words, because its value exists. The cost: "the program" in 1.14
   gets no guess, because no label says "program" alone. The author names it with @.
2. **A revision or a new sentence carries its links in the same change.** A link sent after the
   revision would be refused: the revision starts a sort, and nothing changes while Orbit sorts
   (L5). For a new sentence the label is not known yet, so L3 is not checked there. A link in a
   sentence sorted as background is kept and binds nothing, because only task and rule sentences
   have links (`linksOf`).
3. **Several links go as one change** (`{ links: [...] }`), all or none. Confirming Orbit's guesses
   one at a time would wait on the sort after every click. The page's *Confirm all* sends them
   together.
4. **"Not a value" is kept as a link with no value.** It stops the guess coming back and binds
   nothing.
5. **The walk is told the names, and checked afterwards, not forced.** A read's name is the model's
   answer. Renaming it after the fact would need the read matched to the phrase, which is the guess
   this build exists to take out. A named value that no read produced is a question under the line
   (Decision 17 item 4), and the DataStore's rename is the way out.
6. **@ writes the value's own words**: "the " and its label in lower case ("the credit score"), or,
   for a new name, the name split at its capitals ("the ltv percent"). The author can change the
   words afterwards. If the phrase is no longer there, the link is not sent.
7. **Scenario 14** is scenario 9's words, with the loan-to-value named `ltvPercent`, a name no model
   would pick. It checks the name reached the table's column, the walk's read and the compiled
   branch, and that every loan decided as before. It passed on its first run.
