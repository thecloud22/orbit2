/**
 * The rule sentences, laid out as decision tables (Orbit 2.1-d).
 *
 * A review surface, not an execution path: the walk is still given the rule
 * sentences as the author wrote them. What the tables add is a shape a person
 * can check — which values a rule compares, which task reads each one — and a
 * check the sentences alone cannot give: a rule that compares something no
 * task reads can never be decided, so it blocks confirmation.
 *
 * The model can cite only rule sentences as a table's source and only task
 * sentences as what reads a value; both are enums of the draft's own numbers.
 * `checkRuleTables` still checks every answer, and names every problem.
 */
import { FENCED_IS_DATA, checkRuleTables, fence, looksLikeInstructions, ruleTable, z, type RuleTable } from '@orbit/contract';
import type { ModelProvider } from '@orbit/model';
import type { SortTurn } from './sort.ts';

export type Tabled =
  | { ok: true; tables: RuleTable[]; turns: SortTurn[] }
  | { ok: false; describe: string; turns: SortTurn[] };

export const TABLES = [
  'You are laying out the rules of a written business procedure as decision tables.',
  'You are shown every sentence, numbered, with what it was sorted as: task (done in the application),',
  'rule, forAPerson, background or wontDo.',
  '',
  'Make one table per question the rules decide ("what do we tell the caller?", "who reviews the file?").',
  'Every rule sentence goes in exactly one table: list it in that table\'s sentences.',
  '',
  'columns   Each value a rule compares, named in camelCase, with the label the procedure uses for it.',
  '          readBy is the number of the TASK sentence that reads or finds that value in the application,',
  '          or null if no task sentence does. Do not stretch: if no task reads it, say null.',
  'rows      One per case. Every comparison in a row\'s when must hold together. An "or" is two rows.',
  '          Compare a value with a plain value; never add, subtract or calculate.',
  '          isAbsent and isPresent take no value. then is what happens, in the procedure\'s words.',
  '          sentence is the rule sentence that says so.',
  'otherwise What happens when no row holds, if the procedure says; else null.',
  '',
  'Rows are tried in order and the first that holds decides, so write them in the procedure\'s order.',
  'A column is only ever a value read from the application. What this procedure has itself already',
  'decided ("a referred file", "once it is approved") is never a column: that is the order of the rows.',
  'A sentence that says so ("do not attach conditions to a referred file", "never approve a referred',
  'file") goes in the table\'s sentences and needs no column or row of its own.',
  '',
  FENCED_IS_DATA,
].join('\n');

/**
 * A table with no columns or no rows says nothing, so it is dropped before the
 * answer is checked rather than sinking the tables that do say something.
 * gpt-6-luna twice added an empty fourth table to scenario 2's three real
 * ones, the whole set was discarded, and the walk then improvised the rules
 * itself and ran out of turns.
 */
const answer = z.object({
  tables: z.preprocess((tables) => (Array.isArray(tables)
    ? tables.filter((t) => !(t && typeof t === 'object'
      && ((t as { columns?: unknown[] }).columns?.length === 0 || (t as { rows?: unknown[] }).rows?.length === 0)))
    : tables), z.array(ruleTable)),
});

const shapeFor = (rules: readonly string[], tasks: readonly string[]) => {
  const sentence = { type: 'string', enum: rules };
  return {
    type: 'object',
    properties: {
      tables: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            columns: { type: 'array', items: { type: 'object',
              properties: { name: { type: 'string' }, label: { type: 'string' },
                readBy: tasks.length ? { type: ['string', 'null'], enum: [...tasks, null] } : { type: 'null' } },
              required: ['name', 'label', 'readBy'], additionalProperties: false } },
            rows: { type: 'array', items: { type: 'object',
              properties: {
                when: { type: 'array', items: { type: 'object',
                  properties: { column: { type: 'string' },
                    is: { type: 'string', enum: ['is', 'isNot', 'isMoreThan', 'isAtLeast', 'isLessThan', 'isAtMost',
                      'isBefore', 'isAfter', 'isAbsent', 'isPresent'] },
                    value: { type: ['string', 'null'] } },
                  required: ['column', 'is', 'value'], additionalProperties: false } },
                then: { type: 'string' }, sentence },
              required: ['when', 'then', 'sentence'], additionalProperties: false } },
            otherwise: { type: ['object', 'null'],
              properties: { then: { type: 'string' }, sentence: { type: ['string', 'null'], enum: [...rules, null] } },
              required: ['then', 'sentence'], additionalProperties: false },
            sentences: { type: 'array', items: sentence },
          },
          required: ['question', 'columns', 'rows', 'otherwise', 'sentences'],
          additionalProperties: false,
        },
      },
    },
    required: ['tables'],
    additionalProperties: false,
  };
};

type Labelled = { number: string; text: string; label: string };

export async function tabulate(sentences: readonly Labelled[], model: ModelProvider, firstTurn: number): Promise<Tabled> {
  // A rule sentence written to steer the model is not built into a table.
  const rules = sentences.filter((s) => s.label === 'rule' && !looksLikeInstructions(s.text)).map((s) => s.number);
  const tasks = sentences.filter((s) => s.label === 'task').map((s) => s.number);
  if (rules.length === 0) return { ok: true, tables: [], turns: [] };

  const listed = sentences.map((s) => `${s.number} (${s.label}) ${s.text.replace(/\s+/g, ' ')}`);
  const turns: SortTurn[] = [];
  let correction = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const asking = `Lay out the rules (${rules.join(', ')}) as tables${attempt > 1 ? ', again' : ''}.`;
    const answered = await model.propose(
      { purpose: 'lay the rules out as tables', instruction: TABLES,
        shown: ['SENTENCES:', fence('PROCEDURE', listed.join('\n')), '', correction, asking].filter(Boolean).join('\n') },
      answer, shapeFor(rules, tasks));
    const record = (verdict: SortTurn['verdict'], why: string) => turns.push({
      turn: firstTurn + turns.length, shown: { asking, sentences: rules }, answered: answered.value, verdict, why,
      model: answered.model, provider: answered.provider, tokensIn: answered.tokensIn, tokensOut: answered.tokensOut,
      tokensCached: answered.tokensCached, tokensCacheWritten: answered.tokensCacheWritten,
      costMicros: answered.costUnknown ? null : answered.costMicros,
    });

    if (!answered.value) {
      record('discarded', answered.refusedBecause ?? 'no answer');
      correction = 'Your last answer could not be read. Answer again, as the schema.';
      continue;
    }
    const checked = checkRuleTables(rules, tasks, answered.value.tables);
    if (!checked.ok) {
      const wrong = checked.problems.slice(0, 8).join('; ');
      record('rejected', wrong);
      correction = `Your last answer could not be used: ${wrong}. Answer again.`;
      continue;
    }
    record('kept', `${checked.tables.length} table${checked.tables.length === 1 ? '' : 's'} from ${rules.length} rule sentences`);
    return { ok: true, tables: checked.tables, turns };
  }
  return { ok: false, turns, describe: `Orbit could not lay the rules out as tables: ${turns.at(-1)?.why ?? ''}` };
}
