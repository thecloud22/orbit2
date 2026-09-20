# Claude Code configuration for the Orbit 2.0 repository

Copy `claude-config/` to `.claude/` in the new repository root. It is named without the dot
here only so it is not picked up by the repository it was written in.

```
.claude/
  settings.json
  hooks/guard-immutable.py
```

## What is here, and why only this

The repository that produced the specification these files accompany was built with **no skills,
no hooks and no subagents** — only a permission list and a `CLAUDE.md`. That is the honest
baseline: the discipline came from a clear scope document and a current record of what had
shipped, not from tooling.

Two hooks are included because they enforce product rules an agent will otherwise forget, and
because forgetting them is expensive rather than merely untidy.

### `PreToolUse` — the immutability guard

Refuses writes to two classes of file and says why:

- **The functional specification and slice brief.** They describe the destination. An agent
  reconciling a document to what it just built destroys the only record of what was agreed.
  Progress belongs in `docs/ACTIVE_TASK.md`.
- **Anything under `fixtures/published/`.** Publishing mints a new version; it never edits an
  existing one. This is the product's own rule, enforced by tooling rather than remembered.

Adjust the paths in `hooks/guard-immutable.py` to match the repository's real layout. It uses
`python3` rather than `jq`, which is not installed everywhere.

### `Stop` — the slice check

Prints one reminder when a turn ends: is the record of what shipped current, and is the work
still inside the slice. Cheap, and it catches the two things that quietly rot.

## What to add later, and when

**A formatter/typecheck `PostToolUse` hook.** Add it once the toolchain exists and the commands
are verified — not before, or it fails silently on every write. Pipe-test the command against a
real file before committing it.

**Skills — write none yet.** A skill earns its place when a procedure spans several files and is
easy to get half-right. At the start of a build nothing has been done twice, so any skill written
now is a guess. The first one worth writing is probably *adding a step kind*, because it touches
the closed step vocabulary, validation, execution, evidence and tests at once — and a half-added
step kind validates but produces no evidence. Write it after you have added the second one by
hand and know what the checklist actually is.

**Loops — almost certainly none.** `/loop` is for polling something outside the session, such as
a long CI run. It is not a build tool.

**Subagents and multi-agent workflows — not for construction.** Where fan-out genuinely pays here
is *review*: several reviewers over one diff, each looking for a different class of problem.
`/code-review` already does that. Building a product from scratch is a sequential activity with a
single coherent design; splitting it across agents produces work that does not fit together.
