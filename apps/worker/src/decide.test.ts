/**
 * What the table compiler does without a model: a threshold written with its
 * unit is compared as the number the page shows, and nothing else is touched.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { withoutArticle, withoutUnit } from './decide.ts';

test('a number written with its unit is compared as the number', () => {
  assert.equal(withoutUnit('6 months', 'number'), '6');
  assert.equal(withoutUnit('90 days', 'number'), '90');
  assert.equal(withoutUnit('$806,500', 'number'), '$806,500');
  assert.equal(withoutUnit('43%', 'number'), '43%');
  assert.equal(withoutUnit('6 months', 'text'), '6 months', 'text is compared as written');
  assert.equal(withoutUnit('X', 'number'), 'X', 'nothing numeric, nothing changed');
});

test('a kind of thing named with "a" or "an" is compared as the page writes the kind', () => {
  assert.equal(withoutArticle('a condominium', 'text'), 'condominium');
  assert.equal(withoutArticle('An ARM', 'text'), 'ARM');
  assert.equal(withoutArticle('The Villages', 'text'), 'The Villages', 'a name is kept');
  assert.equal(withoutArticle('A', 'text'), 'A', 'a grade is a value');
  assert.equal(withoutArticle('Adjustable', 'text'), 'Adjustable');
  assert.equal(withoutArticle('a 30-year term', 'number'), 'a 30-year term', 'only text');
});

test('only a yes/no field is compared as the page writes it', async () => {
  const { asThePageWritesIt } = await import('./decide.ts');
  assert.deepEqual(asThePageWritesIt('first-time buyer', 'Yes', 'Yes'), { word: 'Yes', taken: true, unsure: false },
    'the example shows the answer');
  assert.deepEqual(asThePageWritesIt('first-time buyer', 'Yes', 'No'), { word: 'Yes', taken: true, unsure: false },
    'the other answer of a yes/no field');
  assert.deepEqual(asThePageWritesIt('X', 'AE', 'AE'), { word: 'X', taken: false, unsure: false },
    'scenario 6: a flood zone is not reworded into the example\'s own zone');
  assert.deepEqual(asThePageWritesIt('completed', 'Completed', 'Completed'), { word: 'completed', taken: false, unsure: false },
    'the same word, in another case, is no rewording');
  assert.deepEqual(asThePageWritesIt('yes', 'No', 'Yes'), { word: 'yes', taken: false, unsure: false },
    'a procedure that already says yes is not turned into no');
  assert.deepEqual(asThePageWritesIt('first-time buyer', 'first time', 'Yes'), { word: 'first-time buyer', taken: false, unsure: true },
    'an answer the field cannot give is not taken, and is asked');
});

test('an ending is always named within what a step summary takes', async () => {
  const { endingSummary } = await import('./author.ts');
  assert.equal(endingSummary(''), 'Finish — this conclusion has no name yet');
  assert.equal(endingSummary(null), 'Finish — this conclusion has no name yet');
  assert.equal(endingSummary('  Referred to a senior underwriter  '), 'Referred to a senior underwriter');
  const long = endingSummary('The file was referred to a senior underwriter because '.repeat(6));
  assert.ok(long.length <= 200 && long.endsWith('…'), long);
});

test('an otherwise that presses nothing does not end a procedure that goes on after the table', async () => {
  const { compileTables } = await import('./decide.ts');
  const id = () => crypto.randomUUID();
  const approve = id();
  const steps = [
    { id: id(), kind: 'open', summary: 'open', application: 'app', path: '/', arrives: { describe: 'open' }, changesARecord: false },
    { id: id(), kind: 'read', summary: 'LTV', region: { label: 'LTV', binding: {} },
      produces: { name: 'loanToValue', label: 'LTV', type: 'number', required: true } },
    { id: approve, kind: 'activate', summary: 'APPROVE', control: { label: 'APPROVE', binding: {} }, then: { describe: 'x' }, changesARecord: true },
    { id: id(), kind: 'end', summary: 'approved', outcome: 'approved', publishes: [] },
  ] as never[];
  const model = {
    provider: 'test', model: 'test',
    async propose() {
      return { value: { columns: [{ column: 'loanToValue', value: 'loanToValue' }], words: [], why: 'x',
        actions: [
          { action: 'Attach the condition requiring private mortgage insurance.', controls: ['ATTACH PMI'], ends: false, outcome: null, label: null },
          { action: 'No PMI condition is attached.', controls: [], ends: true, outcome: 'noPmiCondition', label: 'No PMI condition' },
        ] }, model: 'test', provider: 'test', tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensCacheWritten: 0, costMicros: 1 };
    },
  };
  const compiled = await compileTables({
    tables: [{ question: 'When is PMI attached?', columns: [{ name: 'loanToValue', label: 'LTV', readBy: '1.8' }],
      rows: [{ when: [{ column: 'loanToValue', is: 'isMoreThan', value: '80' }], then: 'Attach the condition requiring private mortgage insurance.', sentence: '1.9' }],
      otherwise: { then: 'No PMI condition is attached.', sentence: null }, sentences: ['1.9'] }],
    steps, provenance: { [approve]: '1.10' }, order: ['1.8', '1.9', '1.10'],
    seen: [{ index: 1, what: 'button', role: 'key', name: 'ATTACH PMI', binding: {} as never }],
    pageUrl: 'LSV20', model: model as never, firstTurn: 1,
  });
  const kinds = compiled.steps.map((x) => (x.kind === 'end' ? `end:${x.outcome}` : x.kind === 'activate' ? x.summary : x.kind));
  assert.ok(!kinds.includes('end:noPmiCondition'), kinds.join(' → '));
  const pmi = kinds.indexOf('ATTACH PMI');
  assert.equal(kinds[pmi + 1], 'APPROVE', 'after attaching PMI the file is still approved');
});

test('a rule that asks for something to be done, and names nothing to press, is asked about, not built', async () => {
  const { compileTables } = await import('./decide.ts');
  const id = () => crypto.randomUUID();
  const steps = [
    { id: id(), kind: 'open', summary: 'open', application: 'app', path: '/', arrives: { describe: 'open' }, changesARecord: false },
    { id: id(), kind: 'read', summary: 'LTV', region: { label: 'LTV', binding: {} },
      produces: { name: 'loanToValue', label: 'LTV', type: 'number', required: true } },
    { id: id(), kind: 'end', summary: 'approved', outcome: 'approved', publishes: [] },
  ] as never[];
  // Scenario 6: the model answered "attach PMI" with no control, both times.
  const model = {
    provider: 'test', model: 'test',
    async propose() {
      return { value: { columns: [{ column: 'loanToValue', value: 'loanToValue' }], words: [], why: 'x',
        actions: [{ action: 'Attach the condition requiring private mortgage insurance.', controls: [], ends: false, outcome: null, label: null }] },
        model: 'test', provider: 'test', tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensCacheWritten: 0, costMicros: 1 };
    },
  };
  const compiled = await compileTables({
    tables: [{ question: 'What conditions do we attach?', columns: [{ name: 'loanToValue', label: 'LTV', readBy: '1.8' }],
      rows: [{ when: [{ column: 'loanToValue', is: 'isMoreThan', value: '80' }], then: 'Attach the condition requiring private mortgage insurance.', sentence: '1.9' }],
      otherwise: null, sentences: ['1.9'] }],
    steps, provenance: {}, order: ['1.8', '1.9'],
    seen: [{ index: 1, what: 'button', role: 'button', name: 'Require private mortgage insurance', binding: {} as never }],
    pageUrl: '/loan', model: model as never, firstTurn: 1,
  });
  assert.ok(!compiled.steps.some((x) => x.kind === 'branch'), 'no row that matches and does nothing');
  assert.ok(compiled.questions.some((q) => /names nothing to press/.test(q.body)), JSON.stringify(compiled.questions.map((q) => q.body)));
});

test('an action a step of the walk already does may press nothing (scenario 11)', async () => {
  const { compileTables } = await import('./decide.ts');
  const id = () => crypto.randomUUID();
  const steps = [
    { id: id(), kind: 'open', summary: 'open', application: 'app', path: '/', arrives: { describe: 'open' }, changesARecord: false },
    { id: id(), kind: 'read', summary: 'LTV', region: { label: 'LTV', binding: {} },
      produces: { name: 'loanToValue', label: 'LTV', type: 'number', required: true } },
    { id: id(), kind: 'activate', summary: 'Approve file', control: { label: 'Approve file', binding: {} }, then: { describe: 'x' }, changesARecord: true },
    { id: id(), kind: 'end', summary: 'approved', outcome: 'approved', publishes: [] },
  ] as never[];
  const model = {
    provider: 'test', model: 'test',
    async propose() {
      return { value: { columns: [{ column: 'loanToValue', value: 'loanToValue' }], words: [], why: 'x',
        actions: [
          { action: 'Attach the condition requiring private mortgage insurance.', controls: ['Require private mortgage insurance'], ends: false, outcome: null, label: null },
          { action: 'Approve the file.', controls: [], ends: false, outcome: null, label: null },
        ] }, model: 'test', provider: 'test', tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensCacheWritten: 0, costMicros: 1 };
    },
  };
  const compiled = await compileTables({
    tables: [{ question: 'What happens to the file?', columns: [{ name: 'loanToValue', label: 'LTV', readBy: '1.8' }],
      rows: [{ when: [{ column: 'loanToValue', is: 'isMoreThan', value: '80' }], then: 'Attach the condition requiring private mortgage insurance.', sentence: '1.9' }],
      otherwise: { then: 'Approve the file.', sentence: '1.10' }, sentences: ['1.9', '1.10'] }],
    steps, provenance: {}, order: ['1.8', '1.9', '1.10'],
    seen: [{ index: 1, what: 'button', role: 'button', name: 'Require private mortgage insurance', binding: {} as never }],
    pageUrl: '/loan', model: model as never, firstTurn: 1,
  });
  assert.ok(compiled.steps.some((x) => x.kind === 'branch'), 'the table is built');
  assert.equal(compiled.steps.filter((x) => x.kind === 'activate' && x.summary === 'Approve file').length, 1, 'approved once, by the walk\'s step');
  assert.ok(!compiled.questions.some((q) => /names nothing to press/.test(q.body)));
});

test('a column the author named is the value read by that name, whatever the model answers (Decision 20)', async () => {
  const { compileTables } = await import('./decide.ts');
  const id = () => crypto.randomUUID();
  const read = (name: string, label: string) => ({ id: id(), kind: 'read', summary: label, region: { label, binding: {} },
    produces: { name, label, type: 'text', required: true } });
  const steps = (reads: object[]) => [
    { id: id(), kind: 'open', summary: 'open', application: 'app', path: '/', arrives: { describe: 'open' }, changesARecord: false },
    ...reads,
    { id: id(), kind: 'end', summary: 'approved', outcome: 'approved', publishes: [] },
  ] as never[];
  // The guess the author's word replaces: "the program" taken to be the program code.
  const model = {
    provider: 'test', model: 'test',
    async propose() {
      return { value: { columns: [{ column: 'loanProgram', value: 'programCode' }], words: [], why: 'x',
        actions: [{ action: 'refer the file to a senior underwriter.', controls: ['Refer to senior underwriter'], ends: true, outcome: 'referred', label: 'Referred' }] },
        model: 'test', provider: 'test', tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensCacheWritten: 0, costMicros: 1 };
    },
  };
  const compile = (reads: object[], named?: Set<string>) => compileTables({
    tables: [{ question: 'Is the file referred?', columns: [{ name: 'loanProgram', label: 'program', readBy: '1.9' }],
      rows: [{ when: [{ column: 'loanProgram', is: 'isNot', value: 'jumbo' }], then: 'refer the file to a senior underwriter.', sentence: '1.14' }],
      otherwise: null, sentences: ['1.14'] }],
    steps: steps(reads), provenance: {}, order: ['1.9', '1.14'],
    seen: [{ index: 1, what: 'button', role: 'button', name: 'Refer to senior underwriter', binding: {} as never }],
    pageUrl: '/loan', model: model as never, firstTurn: 1, ...(named ? { named } : {}),
  });
  const compared = (c: Awaited<ReturnType<typeof compile>>) => JSON.stringify(c.steps.filter((x) => x.kind === 'branch'));
  const both = [read('loanProgram', 'Loan program'), read('programCode', 'Program code')];

  assert.match(compared(await compile(both)), /"value":"programCode"/, 'unnamed, the model decides');
  const named = await compile(both, new Set(['loanProgram']));
  assert.match(compared(named), /"value":"loanProgram"/, 'named, the author decides');
  assert.doesNotMatch(compared(named), /programCode/);

  const unread = await compile([read('programCode', 'Program code')], new Set(['loanProgram']));
  assert.ok(!unread.steps.some((x) => x.kind === 'branch'), 'not built on a value nobody reads');
  assert.ok(unread.questions.some((q) => /names "program" as loanProgram, and no step reads a value by that name/.test(q.body)),
    JSON.stringify(unread.questions.map((q) => q.body)));
});
