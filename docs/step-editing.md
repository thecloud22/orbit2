# Editing a step

What it takes to make a hand-added step configurable. Not done; planned.

## Why there is a plan rather than a fix

An author can add a step. The step arrives deliberately incomplete —
`A new read step — not configured yet` — and **nothing in the product can
finish it**. `editStep` exists in `apps/api/src/edit.ts` and accepts any
`declares` that parses; no screen calls it. So adding a step produces a draft
that can never be published, and the control has been hidden until that is not
true.

The hard part is not the form. Orbit derives a step's binding from **its own
view of the page** — Decision 15 orders the locator ladder by how often each
rung is measurably wrong, and both ways in (a model walking a written
procedure, a person demonstrating) produce bindings that way. "Let the author
type a selector" is the one thing the ladder exists to prevent. A hand-added
step needs a binding derived from the real page, so the page has to be looked
at, and that is the whole design problem.

## Three defects, not one

1. **`undefined (undefined)`** on the draft screen (`Agent.tsx`), and it is a
   family: `branch`/`check` renders `nothing undefined nothing`, `end` renders
   `Reports ` and `open` renders `Goes to `. The `read` line also asserts the
   step "may legitimately find nothing" — about a step that says nothing at
   all. `describeBinding` already does this properly and is the model to copy.
2. **No caller for `editStep`.** One hit across the whole repo: the route.
3. **A hand-added `end` cannot publish even after confirmation.**
   `confirm.ts` writes the outcome with `jsonb_set` and sets `complete = true`
   unconditionally, bypassing the schema; `end` also requires `publishes`. The
   column says finished and the publish gate says `stepIncomplete: ['publishes']`.
   The gate is right. An unchecked write that declares a step complete is how
   this got past confirmation.

## The recommended shape: a look session

A queued session the worker claims with a lease, exactly as `recording_session`
is. The worker opens the registered application, **replays the draft's steps up
to the insertion point following the graph** rather than the list, and then asks
the surface what it offers — `snapshot` → `shape` → `bindingFor`, unchanged.
The screen polls it, as `Demonstrating` does.

The author picks a line from a list. The request carries `{ lookId, chose }`
and **no binding**; the API reads the binding out of the stored offers by
index. A strict schema with no field that could hold a strategy, a name or a
selector makes that structural rather than remembered.

**Why replay rather than just open the page.** The replay is what corroborates
that this is the page step 5 will meet. Someone navigating there themselves
gives Orbit no way to check they arrived at the right screen, and a binding
derived from the wrong page is exactly the confident lie the ladder exists to
prevent.

### Four ways it refuses, each named

- a preceding binding no longer resolves — says which step and why, which is
  the publish gate's news delivered early;
- the insertion point is behind a branch the walk did not take — names the
  branch, which way it went, and that the example values are the lever;
- a preceding step has `changesARecord: true` — refused **before the browser
  opens**. Replaying presses real buttons in a real system, and a look session
  has no version and no granted authority;
- the draft does not say which application it belongs to. `workflow` has no
  `application_id` today; the only link is through the authoring or recording
  session. Adding it is a prerequisite.

### Rejected

- **Type a name and match it against a snapshot** — what the model does, and
  strictly worse for a person: same browser, an extra failure mode, and the
  list is already in front of them. Kept only as a filter over the list.
- **Ask a model to map the author's words to an element** — permitted, and buys
  nothing on a page already reduced to fifteen lines.
- **Reuse what the authoring walk saw** — `model_call.shown` stores a count,
  not the elements. Storing them would cover only model-authored drafts, only
  at positions the walk visited, and would offer elements that were there
  *then*. Refusing to show a stale list is better than showing one.
- **Reuse a binding another step carries** — cheap and correct, and worth
  having as a first-class choice alongside the look. It cannot be the only
  route: a new step usually names something no step names.

## Order of work

**Step 0 — stop the screen lying.** One `describeMissing` in the contract
beside `describeBinding`, so the draft screen, the walk's refusal and the
publish blocker cannot describe a hole three different ways. `Detail` renders
"Not configured yet" and what is missing, rather than per-kind field lines full
of `undefined`. And `confirm.ts` sets `complete` from a re-parse.

**Step 1 — the cheap kinds, which need no page.** `end` (outcome, publishes),
`check` and `branch` (a comparison over values earlier steps produce). These
are picklists over what the draft already holds. `editStep` gains the
"does not make it worse" gate its siblings have — configuring a `branch`
changes the graph, and today only `moveStep` and `deleteStep` are checked.

**Step 2 — the look session**, for `read`, `enter` and `activate`. A new
`offers()` on the `Surface` interface, so a terminal can answer it from screen
addresses and each surface derives its own bindings.

**Step 3 — the kind picker** offers the seven kinds that can be configured
*and executed*, and names the three that are absent with the reason.
`collect`, `forEach` and `handOff` are not executed at all — `execute.ts` halts
on them — so configuring one produces a version that publishes and then halts
mid-run.

## Verification

The proof that matters is end to end against `demo/mortgage-portal`: insert a
`read` after the step that opens the loan file, look, pick, name it, confirm,
**publish** — which is what previously could not happen — and run it, with the
run page showing the hand-added step resolving and its screenshot boxed on the
element it resolved to. Then an `activate`, then a `branch` on the value the
new `read` produces, which proves the cheap and expensive paths compose.

Unit-level: that the binding written is byte-for-byte the one in the look's
offers, and that a request carrying a binding is **refused by the schema** —
the guarantee proved structurally rather than asserted.

`apps/web` has no test harness, so the rendering itself is checked by eye; the
phrases it renders are unit-tested in the contract. That is the honest split.

## Found on the way, not fixed

- **The publish gate never opens the page.** `mintVersion` runs only
  `checkForPublication`; `resolveForPublication` is reachable only from a CLI.
  Nothing stops an invented binding from publishing today — the protection is
  entirely that no screen offers a way to type one.
- **`mintVersion` copies every registered application** into every version
  rather than the one the workflow was brought in against. `workflow.application_id`
  is the prerequisite for fixing it.
