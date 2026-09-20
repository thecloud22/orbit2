/**
 * §4's refusals, as assertions.
 *
 * Each of these is a workflow somebody could plausibly build, and each must be
 * refused with a blocker naming the specific thing — not "validation failed".
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { describeBlocker, type Step } from '@orbit/contract';
import { checkForPublication } from './publish.ts';

const ids = Array.from({ length: 9 }, () => crypto.randomUUID());
const read = (i: number, value: string): Step => ({
  id: ids[i]!, kind: 'read', summary: `read ${value}`,
  region: { label: value, binding: { strategy: 'roleAndName', role: 'heading', name: value } },
  produces: { name: value, label: value, type: 'text', required: false },
});
const end = (i: number, outcome: string, publishes: string[] = []): Step =>
  ({ id: ids[i]!, kind: 'end', summary: outcome, outcome, publishes });
const declared = (outcomes: string[], examples = Object.fromEntries(outcomes.map((o) => [o, 'x']))) =>
  ({ inputs: ['reference'], outcomes, examples });

test('a value no step produces is refused, naming the step and the value', () => {
  const steps: Step[] = [read(0, 'status'), end(1, 'done', ['nowhere'])];
  const [blocker, ...rest] = checkForPublication(steps, declared(['done']));
  assert.equal(rest.length, 0);
  assert.equal(blocker?.kind, 'valueNotProduced');
  assert.match(describeBlocker(blocker!), /"nowhere", which no step produces/);
});

test('a value produced on only one branch is a different refusal from one produced nowhere', () => {
  // The fix differs: one wants a step added, the other wants the reference
  // moved or the other path to produce it too.
  // The two paths have to MEET for there to be anything to intersect: one
  // reaches the ending having read the amount, the other reaches it without.
  const steps: Step[] = [
    { id: ids[0]!, kind: 'branch', summary: 'which way',
      when: { of: 'absence', operator: 'isAbsent', left: { from: 'input', value: 'reference' } },
      ifTrue: ids[1]!, ifFalse: ids[2]! },
    read(1, 'amount'),                 // one path produces it
    end(2, 'done', ['amount']),        // and both paths end here
  ];
  const blockers = checkForPublication(steps, declared(['done']));
  const notProduced = blockers.find((b) => b.kind === 'valueNotProduced');
  assert.equal(notProduced?.kind, 'valueNotProduced');
  assert.equal(notProduced.producedSomewhere, true, 'it exists, just not on every path');
  assert.match(describeBlocker(notProduced), /not produced on every path/);
});

test('a conclusion the workflow does not declare is refused', () => {
  const steps: Step[] = [read(0, 'status'), end(1, 'invented', ['status'])];
  const blockers = checkForPublication(steps, declared(['done']));
  assert.ok(blockers.some((b) => b.kind === 'outcomeNotDeclared'));
  assert.ok(blockers.some((b) => b.kind === 'outcomeUnreachable'), 'and "done" is now unreachable');
});

test('a binding that can return the wrong element is refused without corroboration', () => {
  // Decision 15: measured 28 confident wrong binds out of 181.
  const steps: Step[] = [
    { id: ids[0]!, kind: 'read', summary: 'the amount',
      region: { label: 'Amount', binding: { strategy: 'structural', name: 'Amount' } },
      produces: { name: 'amount', label: 'Amount', type: 'text', required: true } },
    end(1, 'done', ['amount']),
  ];
  const blocker = checkForPublication(steps, declared(['done']))
    .find((b) => b.kind === 'bindingNeedsCorroboration');
  assert.equal(blocker?.kind, 'bindingNeedsCorroboration');
  assert.match(describeBlocker(blocker!), /can return the wrong thing/);
});

test('an ending with no example is refused, because no test could prove it', () => {
  const steps: Step[] = [read(0, 'status'), end(1, 'done', ['status'])];
  const blocker = checkForPublication(steps, declared(['done'], {}))
    .find((b) => b.kind === 'endingHasNoExample');
  assert.equal(blocker?.kind, 'endingHasNoExample');
});

test('every blocker is reported, not the first', () => {
  const steps: Step[] = [read(0, 'status'), end(1, 'invented', ['missing'])];
  const blockers = checkForPublication(steps, declared(['done'], {}));
  assert.ok(blockers.length >= 3, `expected several, got ${blockers.map((b) => b.kind).join(', ')}`);
});

test('a workflow with nothing wrong has nothing to report', () => {
  const steps: Step[] = [read(0, 'status'), end(1, 'done', ['status'])];
  assert.deepEqual(checkForPublication(steps, declared(['done'])), []);
});

test('a step nothing can reach is refused, because it would never run', () => {
  // The reorder that provoked this: an ending dragged to the front leaves
  // every step behind it stranded, and the structural checks stayed quiet
  // because an unreachable step is on no path that could run out.
  const blockers = checkForPublication(
    [end(0, 'done'), read(1, 'status'), read(2, 'queue')], declared(['done']));

  assert.deepEqual(
    blockers.filter((b) => b.kind === 'stepUnreachable').map((b) => b.step),
    [2, 3], 'both stranded steps named, not just the first');
});
