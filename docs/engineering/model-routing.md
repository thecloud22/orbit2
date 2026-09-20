# Model Routing Policy

## Purpose

This policy defines how Orbit work is divided between Opus and Sonnet when both models are available.

Use Opus for important design and planning decisions. Use Sonnet for implementation, testing, review, and commits after the design is clear.

This policy supports good engineering practice; it does not replace human approval, code review standards, tests, or repository conventions.

## Default Workflow

```text
Opus designs and defines the work.
Sonnet implements, tests, reviews, and commits it.
```

Use Opus when the task requires interpretation, design choices, tradeoffs, or a clear plan.

Use Sonnet when the task has a defined goal, scope, and expected behavior.

## Opus Responsibilities

Opus is responsible for designing the work before implementation begins.

Use Opus for:

- Understanding the relevant repository context and requirements.
- Clarifying ambiguous requests.
- Defining the problem to solve.
- Choosing the overall approach.
- Setting scope, exclusions, and acceptance criteria.
- Designing important interfaces, workflows, and data behavior.
- Making decisions involving security, permissions, data integrity, persistence, dependencies, or system-wide behavior.
- Identifying risks, edge cases, rollback needs, and required validation.
- Writing a clear implementation brief for Sonnet.

Opus should leave Sonnet with an actionable plan rather than an open-ended problem.

## Sonnet Responsibilities

Sonnet is responsible for carrying out the approved design.

Sonnet may:

- Read the relevant code and task brief.
- Implement the planned change.
- Modify production code and tests within the approved scope.
- Fix related type, lint, formatting, import, mock, fixture, and test issues.
- Make small implementation adjustments needed to complete the approved behavior.
- Run the required checks.
- Review its complete diff for correctness, scope, regressions, and unintended changes.
- Summarize the work, tests, limitations, and follow-up items.
- Create the commit.

Sonnet should use normal engineering judgment while staying within the approved design and scope.

## When Sonnet Must Escalate

Sonnet must stop and return the work to Opus if it discovers that completing the task requires a new design decision.

Examples include:

- The requirement is unclear or conflicts with existing behavior.
- The chosen approach does not work and an alternative design is needed.
- The change affects security, permissions, sensitive data, or data integrity in an unplanned way.
- The work requires a new dependency or a significant dependency change.
- The change expands beyond the approved scope or affects unrelated areas of the system.
- Tests reveal that the expected behavior needs to be reconsidered.
- The task requires a significant change to persistence, migration, retention, or recovery behavior.
- The implementation would introduce a meaningful compatibility or operational risk.

Sonnet should report:

- What it attempted.
- The affected files.
- The command(s) run and relevant output.
- The smallest reproducible issue.
- Why a new design decision is needed.
- Any reasonable options it identified, without choosing one unless authorized.

## Implementation Brief

Before Sonnet begins, Opus should provide a short brief containing:

1. The goal and intended outcome.
2. The approved approach.
3. Files or areas likely to change.
4. Scope boundaries and exclusions.
5. Expected behavior and key edge cases.
6. Required tests or validation commands.
7. Conditions that require escalation back to Opus.

Example:

```text
Goal:
Add validation for invalid artifact storage keys.

Approved approach:
Reject absolute paths and keys containing `..` before any file access.

Expected behavior:
- Invalid keys return the existing validation error.
- Missing valid keys return the existing not-found error.
- Valid nested keys continue to work.

Scope:
- Update the artifact storage implementation and its unit tests.
- Do not change storage configuration, dependencies, or database behavior.

Validation:
pnpm --filter @orbit/artifact-storage test
pnpm typecheck

Escalate if:
The change requires a broader storage-policy decision, changes how existing valid keys
are interpreted, or affects another storage backend.
```

## Review and Commit

Before committing, Sonnet must:

1. Review all changed files and the complete diff.
2. Confirm the work matches the approved design and scope.
3. Confirm tests were not weakened or removed merely to make checks pass.
4. Run the required checks.
5. Summarize changed files, validation results, limitations, and follow-up work.
6. Create a clear commit.

If Sonnet finds a design-level concern during review, it must escalate to Opus before committing.

## Exceptions

A task may skip Opus when it is clearly mechanical and low risk, such as:

- Formatting-only changes.
- Straightforward lint or TypeScript fixes.
- Updating an already-decided test assertion.
- A small documentation correction.
- A simple import, export, mock, or fixture repair.

For anything involving design, ambiguity, security, persistence, dependencies, or meaningful cross-system behavior, begin with Opus.
