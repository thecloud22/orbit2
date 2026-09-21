/**
 * These do not test Zod. They test that four guarantees are impossible to
 * violate rather than merely undesirable — which is the difference between a
 * product rule and a note in a document.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { comparison, enterValue, valueRef } from './values.ts';
import { STEP_KINDS, describeMissing, describeMissingAll, step, type StepKind } from './steps.ts';
import { object, z } from './zod.ts';

test('an unknown key is refused, not quietly dropped', () => {
  const schema = object({ claim: z.string() });
  const result = schema.safeParse({ claim: 'x', actor: 'someone' });
  assert.equal(result.success, false, 'a smuggled actor must not be accepted');
  // The failure mode this guards: zod's own z.object() would have returned
  // { claim: 'x' } and told the caller everything was fine.
  assert.deepEqual(z.object({ claim: z.string() }).parse({ claim: 'x', actor: 'someone' }), { claim: 'x' });
});

test('a secret may stand only where an enter step puts a value', () => {
  const secret = { from: 'secret', credential: 'portalPassword' };
  assert.equal(enterValue.safeParse(secret).success, true);
  assert.equal(valueRef.safeParse(secret).success, false, 'not an ordinary value reference');

  // And therefore nowhere a comparison, a read or an end can reach it.
  assert.equal(
    comparison.safeParse({ of: 'text', operator: 'is', left: secret, right: { from: 'input', value: 'a' } }).success,
    false,
    'a secret must not be comparable',
  );
});

test('an operator belongs to a type, so text cannot be ordered', () => {
  const left = { from: 'step', value: 'status' } as const;
  const right = { from: 'literal', literal: { type: 'text', text: 'Open' } } as const;
  assert.equal(comparison.safeParse({ of: 'text', operator: 'is', left, right }).success, true);
  assert.equal(comparison.safeParse({ of: 'text', operator: 'isMoreThan', left, right }).success, false);
});

test('absence is the only comparison a value that was never produced allows', () => {
  const left = { from: 'step', value: 'outstanding' } as const;
  assert.equal(comparison.safeParse({ of: 'absence', operator: 'isAbsent', left }).success, true);
});

test('the published list of kinds is the union, exactly', () => {
  const declared = new Set<string>(STEP_KINDS);
  const fromSchema = new Set(step.options.map((o) => o.shape.kind.value as StepKind));
  assert.deepEqual([...declared].sort(), [...fromSchema].sort());
  assert.equal(declared.size, 10, 'ten kinds; an eleventh is a decision, not a commit');
});

test('a step that binds to a page carries what a refusal will name', () => {
  const read = step.safeParse({
    id: '3f1a5b7c-0000-4000-8000-000000000001',
    kind: 'read',
    summary: 'Take the status',
    region: { label: 'Status', binding: null },
    produces: { name: 'status', label: 'Status', type: 'text', required: false },
  });
  assert.equal(read.success, true);
  // `required: false` is what makes "the record does not exist" expressible,
  // and therefore what makes acceptance criterion 7 writable at all.
});

test('every required field of every step kind has a phrase', () => {
  // The draft screen, the refusal when a reading could not be stored, and the
  // publish gate all name the same hole. Said in three places it was said
  // three ways, and in one of them not at all — "undefined (undefined)".
  // Driven off the schema so a new kind fails here, at the site that must
  // handle it, rather than on somebody's screen.
  const holes: string[] = [];
  for (const kind of STEP_KINDS) {
    const parsed = step.safeParse({ kind, id: crypto.randomUUID(), summary: 'x' });
    if (parsed.success) continue;
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? '');
      if (!field) continue;
      const said = describeMissing(field);
      if (said === `its ${field}`) holes.push(`${kind}.${field}`);
    }
  }
  assert.deepEqual(holes, [], 'each of these renders as "its <field>" instead of a sentence');
});

test('a step missing several things says so as one sentence', () => {
  assert.equal(describeMissingAll([]), 'It is not a shape Orbit can carry out.');
  assert.match(describeMissingAll(['produces']), /^It does not say what the value it reads is called\.$/);
  assert.match(describeMissingAll(['when', 'ifTrue', 'ifFalse']),
    /It does not say what is being compared, which step follows when it holds or which step follows when it does not\./);
});
