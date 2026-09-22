/**
 * Sorting a procedure's sentences (Orbit 2.1).
 *
 * The model is shown the sentences Orbit numbered and answers with one label
 * per number. That is the whole of its part: it never sees a page, never
 * proposes a step, and has no way to add, drop or reword a sentence, because
 * an answer that mentions a number it was not given — or leaves one out, or
 * gives one twice — fails `checkLabelling` and is not kept.
 *
 * A long procedure is sorted a batch at a time, so one answer never has to
 * hold the whole document. A batch whose answer fails the check is asked once
 * more, told exactly what was wrong; a second failure refuses the sort rather
 * than keep the batches that happened to pass. Every call is recorded,
 * including the ones that produced nothing usable (§12).
 */
import { checkLabelling, labelEntry, z, type LabelEntry } from '@orbit/contract';
import type { Answered, ModelProvider } from '@orbit/model';

export const BATCH = 40;

/** A sort call, for the record. The same shape a walk's turn is stored in. */
export interface SortTurn {
  turn: number;
  shown: { asking: string; sentences: string[] };
  answered: unknown;
  verdict: 'kept' | 'discarded' | 'rejected';
  why: string;
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  tokensCacheWritten: number;
  costMicros: number | null;
}

export type Sorted =
  | { ok: true; labels: LabelEntry[]; turns: SortTurn[] }
  | { ok: false; describe: string; turns: SortTurn[] };

const answer = z.object({ labels: z.array(labelEntry) });

const shape = {
  type: 'object',
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sentence: { type: 'string' },
          label: { type: 'string', enum: ['task', 'rule', 'forAPerson', 'background', 'wontDo'] },
          reason: { type: 'string' },
          basis: { type: 'string', enum: ['stated', 'inferred'] },
        },
        required: ['sentence', 'label', 'reason', 'basis'],
        additionalProperties: false,
      },
    },
  },
  required: ['labels'],
  additionalProperties: false,
};

/**
 * Fixed text, first in every call, so the provider's prompt cache can reuse
 * it. The sentences, which differ every time, come after it.
 */
export const SORT = [
  'You are sorting the sentences of a written business procedure.',
  'A machine called Orbit will carry out part of it in a business application. People do the rest.',
  '',
  'Give every numbered sentence exactly ONE label:',
  '',
  'task        Something to do in the application: open, sign in, search, enter, press, read or record',
  '            what the screen shows. Approving, declining or updating a record in the application is',
  '            still a task.',
  'rule        A condition or policy that decides what happens: a threshold, "if ... then ...",',
  '            "only when ...", "otherwise ...", what counts as which outcome.',
  'forAPerson  Work only a person can do or decide: a phone call, a judgement, waiting for someone,',
  '            asking someone, anything done outside the application.',
  'background  Says nothing anyone has to do: a title, a heading, a purpose, an explanation, a note on',
  '            how often something happens.',
  'wontDo      Something the procedure says NOT to do, or that must not be done at all.',
  '',
  'basis is "stated" when the sentence itself says so plainly, and "inferred" when you concluded it.',
  'reason is one short plain sentence saying why.',
  '',
  'Answer with every sentence number you are given, exactly once each, in order.',
  'Copy each number exactly as written. Never add a number, never skip one, never change a sentence.',
  'Each sentence line reads:   number [kind] text',
  'The kind in brackets is how the sentence is laid out, not what it is for.',
].join('\n');

type Sentence = { number: string; text: string; kind: string };

const KIND: Record<string, string> = { prose: 'text', heading: 'heading', item: 'step', leadIn: 'lead-in' };

export async function sortSentences(
  sentences: readonly Sentence[], model: ModelProvider, firstTurn = 1,
): Promise<Sorted> {
  const turns: SortTurn[] = [];
  const labels: LabelEntry[] = [];

  for (let at = 0; at < sentences.length; at += BATCH) {
    const batch = sentences.slice(at, at + BATCH);
    const numbers = batch.map((s) => s.number);
    const listed = batch.map((s) => `${s.number} [${KIND[s.kind] ?? s.kind}] ${s.text.replace(/\s+/g, ' ')}`);
    const range = `${numbers[0]} to ${numbers.at(-1)}`;

    let correction = '';
    let kept = false;
    for (let attempt = 1; attempt <= 2 && !kept; attempt++) {
      const asking = `Label sentences ${range}${attempt > 1 ? ', again' : ''}.`;
      const answered = await model.propose(
        { purpose: 'sort the procedure\'s sentences', instruction: SORT,
          shown: [`SENTENCES (${range}):`, ...listed, '', correction, asking].filter(Boolean).join('\n') },
        answer, shape);

      const record = (verdict: SortTurn['verdict'], why: string) => turns.push(turnOf(
        firstTurn + turns.length, { asking, sentences: numbers }, answered, verdict, why));

      if (!answered.value) {
        record('discarded', answered.refusedBecause ?? 'no answer');
        correction = 'Your last answer could not be read. Answer again, as the schema.';
        continue;
      }
      const checked = checkLabelling(numbers, answered.value.labels);
      if (!checked.ok) {
        const wrong = problemsOf(checked);
        record('rejected', wrong);
        correction = `Your last answer could not be used: ${wrong}. Answer again for exactly these numbers.`;
        continue;
      }
      record('kept', `labelled ${numbers.length} sentence${numbers.length === 1 ? '' : 's'}`);
      labels.push(...checked.labels);
      kept = true;
    }

    if (!kept) {
      return { ok: false, turns,
        describe: `Orbit could not get one label for every sentence from ${range}, twice, so none of the sort was kept. `
          + `${turns.at(-1)?.why ?? ''}` };
    }
  }
  return { ok: true, labels, turns };
}

function problemsOf(checked: { skipped: string[]; duplicated: string[]; invented: string[]; malformed?: string }): string {
  if (checked.malformed) return `it was not the shape asked for (${checked.malformed})`;
  return [
    checked.skipped.length ? `it left out ${checked.skipped.join(', ')}` : '',
    checked.duplicated.length ? `it labelled ${checked.duplicated.join(', ')} more than once` : '',
    checked.invented.length ? `it answered about ${checked.invented.join(', ')}, which it was not given` : '',
  ].filter(Boolean).join('; ');
}

function turnOf(
  turn: number, shown: SortTurn['shown'], answered: Answered<unknown>, verdict: SortTurn['verdict'], why: string,
): SortTurn {
  return {
    turn, shown, answered: answered.value, verdict, why,
    model: answered.model, provider: answered.provider,
    tokensIn: answered.tokensIn, tokensOut: answered.tokensOut,
    tokensCached: answered.tokensCached, tokensCacheWritten: answered.tokensCacheWritten,
    costMicros: answered.costUnknown ? null : answered.costMicros,
  };
}
