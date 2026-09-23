/**
 * The rules as tables, against a model that answers what the test chose: a
 * set that accounts for every rule sentence is kept, one that does not is
 * asked again and then refused, and a procedure with no rules asks nothing.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Answered, Asked, ModelProvider } from '@orbit/model';
import { TABLES, tabulate } from './tables.ts';

function fake(replies: unknown[]): ModelProvider & { asked: Asked[]; shapes: unknown[] } {
  const asked: Asked[] = []; const shapes: unknown[] = [];
  return {
    provider: 'test', model: 'test', asked, shapes,
    async propose<T>(a: Asked, schema: { safeParse(v: unknown): { success: boolean; data?: T } }, shape: unknown): Promise<Answered<T>> {
      asked.push(a); shapes.push(shape);
      const parsed = schema.safeParse(replies[asked.length - 1]);
      return { value: parsed.success ? parsed.data! : null, model: 'test', provider: 'test',
        tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensCacheWritten: 0, costMicros: 1,
        ...(parsed.success ? {} : { refusedBecause: 'not the shape' }) };
    },
  } as ModelProvider & { asked: Asked[]; shapes: unknown[] };
}

const sentences = [
  { number: '1.1', text: 'Search for the claim.', label: 'task' },
  { number: '1.2', text: 'If there is no such claim, say so.', label: 'rule' },
  { number: '1.3', text: 'Phone them.', label: 'forAPerson' },
];
const table = (sentences_: string[]) => ({ tables: [{
  question: 'What do we tell the caller?',
  columns: [{ name: 'claimFound', label: 'Claim found', readBy: '1.1' }],
  rows: [{ when: [{ column: 'claimFound', is: 'isAbsent', value: null }], then: 'Say there is no such claim', sentence: '1.2' }],
  otherwise: null, sentences: sentences_ }] });

test('tables accounting for every rule sentence are kept, from one call', async () => {
  const model = fake([table(['1.2'])]);
  const made = await tabulate(sentences, model, 5);
  assert.equal(made.ok, true);
  assert.equal(made.turns[0]!.turn, 5);
  assert.equal(model.asked[0]!.instruction, TABLES);
  const shape = model.shapes[0] as { properties: { tables: { items: { properties: { sentences: { items: { enum: string[] } } } } } } };
  assert.deepEqual(shape.properties.tables.items.properties.sentences.items.enum, ['1.2'], 'only rule sentences can be cited');
});

test('a set that leaves a rule out is asked again, then refused', async () => {
  const two = [...sentences, { number: '1.4', text: 'Otherwise tell them the status.', label: 'rule' }];
  const made = await tabulate(two, fake([table(['1.2']), table(['1.2'])]), 1);
  assert.equal(made.ok, false);
  assert.deepEqual(made.turns.map((t) => t.verdict), ['rejected', 'rejected']);
  assert.match(made.ok ? '' : made.describe, /rule sentence 1\.4 is in no table/);
});

test('a procedure with no rules asks the model nothing', async () => {
  const model = fake([]);
  const made = await tabulate(sentences.filter((s) => s.label !== 'rule'), model, 1);
  assert.deepEqual(made, { ok: true, tables: [], turns: [] });
  assert.equal(model.asked.length, 0);
});

test('an empty table is dropped, not allowed to sink the tables that say something', async () => {
  const withEmpty = table(['1.2']);
  withEmpty.tables.push({ question: 'Anything else?', columns: [], rows: [], otherwise: null, sentences: [] });
  const made = await tabulate(sentences, fake([withEmpty]), 1);
  assert.equal(made.ok, true);
  assert.equal(made.ok && made.tables.length, 1);
  assert.deepEqual(made.turns.map((t) => t.verdict), ['kept']);
});
