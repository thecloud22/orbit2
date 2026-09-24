/**
 * A value the author named in a line of work (Decision 20), in the walk: the
 * walk is shown the name, and a walk that does not read a value by that name
 * leaves a question under the line rather than going quiet about it. A page
 * and a model stand in, so what is proved is Orbit's part and nothing else.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { authorFromProcedure } from './author.ts';
import type { Looking } from './looking.ts';
import type { Seen } from './snapshot.ts';

const page: Seen[] = [
  { index: 1, what: 'heading', role: 'heading', name: 'Loan ML-26-04471', binding: {} as never },
  { index: 2, what: 'value', role: 'text', name: '762', labelledBy: 'Credit score', binding: { name: 'Credit score', strategy: 'structural' } as never },
];
const looking = async (): Promise<Looking> => ({
  place: () => '/loan', open: async () => {}, look: async () => page, visibleText: async () => 'Loan ML-26-04471 Credit score 762',
  picture: async () => null, boxOf: async () => undefined, type: async () => {}, press: async () => {},
  restart: async () => {}, replay: async () => ({ ok: true }), close: async () => {},
});

/** A model that reads the credit score under the name it is told to use, or under its own. */
function modelNaming(value: string) {
  const shown: string[] = [];
  let turn = 0;
  const answer = (v: unknown) => ({ value: v, model: 'test', provider: 'test', tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensCacheWritten: 0, costMicros: 1 });
  return {
    shown,
    provider: 'test', model: 'test',
    async propose(asked: { purpose: string; shown: string }) {
      shown.push(asked.shown);
      if (asked.purpose === 'name the conclusions') {
        return answer({ whenFound: { outcome: 'read', label: 'Read' }, whenAbsent: null, missingValue: null, why: 'x' });
      }
      turn++;
      const base = { optional: false, changesARecord: false, onlyIf: null, why: 'x', belongsTo: null };
      return answer(turn === 1
        ? { ...base, act: 'read', element: 'Credit score', value, sentence: '1.1' }
        : { ...base, act: 'done', element: null, value: null, sentence: null });
    },
  };
}

const opts = (model: ReturnType<typeof modelNaming>) => ({
  procedure: 'Read the credit score.', origin: 'http://localhost:4101', startPath: '/loan', inputs: {},
  model: model as never, looking, maxTurns: 4,
  sentences: [{ number: '1.1', text: 'Read the credit score.' }], taskSentences: ['1.1'],
  named: [{ sentence: '1.1', phrase: 'the credit score', value: 'creditScore' }],
});

test('the walk is shown the name the author gave, and a read by that name leaves nothing to ask', async () => {
  const model = modelNaming('creditScore');
  const draft = await authorFromProcedure(opts(model));
  assert.match(model.shown[0]!, /THE AUTHOR NAMED THESE VALUES[\s\S]*line 1\.1: "the credit score" is creditScore/);
  assert.ok(draft.steps.some((s) => s.kind === 'read' && s.produces.name === 'creditScore'), JSON.stringify(draft.turns.map((t) => [t.verdict, t.why])));
  assert.ok(!draft.questions.some((q) => /no step reads a value by that name/.test(q.body)));
});

test('a walk that reads the value under another name leaves a question under the line', async () => {
  const draft = await authorFromProcedure(opts(modelNaming('creditRating')));
  assert.ok(draft.steps.some((s) => s.kind === 'read' && s.produces.name === 'creditRating'), 'the read was kept, under its own name');
  const asked = draft.questions.find((q) => /no step reads a value by that name/.test(q.body));
  assert.ok(asked, JSON.stringify(draft.questions.map((q) => q.body)));
  assert.equal(asked!.body, '1.1 names "the credit score" as creditScore, and no step reads a value by that name. '
    + 'Map it again, or say what "the credit score" means.');
  assert.equal((asked as { sentence?: string }).sentence, '1.1');
});

test('the tables are shown the names the author gave, and a set that ignores one is asked again', async () => {
  const { tabulate } = await import('./tables.ts');
  const table = (column: string) => ({ question: 'Is the file referred?',
    columns: [{ name: column, label: 'program', readBy: '1.1' }],
    rows: [{ when: [{ column, is: 'isNot', value: 'jumbo' }], then: 'refer the file', sentence: '1.2' }],
    otherwise: null, sentences: ['1.2'] });
  const shown: string[] = [];
  const answers = [table('programCode'), table('loanProgram')];
  const model = { provider: 'test', model: 'test', async propose(asked: { shown: string }) {
    shown.push(asked.shown);
    return { value: { tables: [answers[shown.length - 1]] }, model: 'test', provider: 'test', tokensIn: 1, tokensOut: 1,
      tokensCached: 0, tokensCacheWritten: 0, costMicros: 1 };
  } };
  const made = await tabulate([
    { number: '1.1', text: 'Read the loan program.', label: 'task' },
    { number: '1.2', text: 'If the program is not jumbo, refer the file.', label: 'rule' },
  ], model as never, 1, [{ sentence: '1.2', phrase: 'the program', value: 'loanProgram' }]);
  assert.match(shown[0]!, /VALUES THE AUTHOR NAMED[\s\S]*1\.2: "the program" is loanProgram/);
  assert.equal(made.turns[0]!.verdict, 'rejected');
  assert.match(made.turns[0]!.why, /1\.2 says "the program" is loanProgram, and no column is named loanProgram/);
  assert.ok(made.ok && made.tables[0]!.columns[0]!.name === 'loanProgram');
});
