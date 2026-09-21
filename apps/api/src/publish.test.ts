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
// A read bound the way a real one is: by whatever labels the value, not by
// the value. The role here was 'heading' — incidental fixture data, chosen
// before a read bound to a heading was recognised as circular, and every
// assertion in this file is about something else.
const read = (i: number, value: string): Step => ({
  id: ids[i]!, kind: 'read', summary: `read ${value}`,
  region: { label: value, binding: { strategy: 'roleAndName', role: 'cell', name: `${value} label` } },
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

test('a read that finds the value by the value is refused, because it can only confirm itself', () => {
  // Taken from a real authored workflow: the model was asked to name the
  // element holding the note rate, the snapshot named that element by its own
  // text, and the binding came out as "6.375%" — the rate on the page that
  // day. Every run since reported noteRate: null, and succeeded, because the
  // value was optional. A green run that established nothing.
  const circular: Step = {
    id: ids[0]!, kind: 'read', summary: 'the note rate',
    region: { label: 'Note rate', binding: { strategy: 'roleAndName', role: 'text', name: '6.375%' } },
    produces: { name: 'noteRate', label: 'Note rate', type: 'text', required: false },
  };
  const blockers = checkForPublication([circular, end(1, 'done', ['noteRate'])], declared(['done']));

  const found = blockers.find((b) => b.kind === 'readIsCircular');
  assert.ok(found, `refused: ${JSON.stringify(blockers)}`);
  assert.match(describeBlocker(found!), /finds "noteRate" by looking for "6\.375%"/);
  assert.match(describeBlocker(found!), /Name what labels the value instead/);
});

test('a read bound to what labels the value is not refused', () => {
  const labelled: Step = {
    id: ids[0]!, kind: 'read', summary: 'the note rate',
    region: { label: 'Note rate', binding: { strategy: 'structural', name: 'Note rate',
                                             corroborate: { tag: 'dd' } } },
    produces: { name: 'noteRate', label: 'Note rate', type: 'text', required: false },
  };
  const blockers = checkForPublication([labelled, end(1, 'done', ['noteRate'])], declared(['done']));
  assert.equal(blockers.filter((b) => b.kind === 'readIsCircular').length, 0);
});

test('activating a control named by its own text is not circular, and is allowed', () => {
  // The rule is about reads. The text on a button is the name of the control;
  // the text in a region is the answer.
  const press: Step = {
    id: ids[0]!, kind: 'activate', summary: 'open the file',
    control: { label: 'Open file', binding: { strategy: 'roleAndName', role: 'button', name: 'Open file' } },
    then: { describe: 'the file is shown' }, changesARecord: false,
  };
  const blockers = checkForPublication([press, end(1, 'done')], declared(['done']));
  assert.equal(blockers.filter((b) => b.kind === 'readIsCircular').length, 0);
});

test('a read bound to a heading is circular, like a read bound to its own text', () => {
  // `read Underwriting pipeline, into filesAwaitingDecision` can only ever
  // produce "Underwriting pipeline": a heading is located by the words it
  // contains, so the step returns the words it searched for. Authoring
  // produced this for "note how many files are awaiting a decision" — the
  // count sits in a sentence, and the heading was the nearest nameable thing.
  const steps: Step[] = [
    { id: 'a', kind: 'read', summary: 'the count',
      region: { label: 'Underwriting pipeline',
                binding: { strategy: 'roleAndName', role: 'heading', name: 'Underwriting pipeline' } },
      produces: { name: 'filesAwaitingDecision', label: 'Files awaiting a decision', type: 'text', required: true } },
    { id: 'b', kind: 'end', summary: 'done', outcome: 'loaded', publishes: [] },
  ];
  const blockers = checkForPublication(steps, { inputs: [], outcomes: ['loaded'], examples: {} });
  const circular = blockers.find((b) => b.kind === 'readIsCircular');
  assert.ok(circular, `expected readIsCircular, got ${blockers.map((b) => b.kind).join(', ')}`);
  assert.equal(circular.kind === 'readIsCircular' && circular.looksFor, 'Underwriting pipeline');
});
