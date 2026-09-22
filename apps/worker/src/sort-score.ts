/**
 * How a sort compares with a person's labels (2.1-h).
 *
 * Agreement is the share of sentences given the same label. It is reported
 * with every disagreement listed, because a number alone hides which way a
 * model errs — and a sentence Orbit should do, sorted as background, is a step
 * that silently never exists, which matters more than a heading called a rule.
 */
import { SENTENCE_LABELS, type SentenceLabel } from '@orbit/contract';

export type Scored = {
  total: number;
  agreed: number;
  /** Person's label → model's label → count. */
  confusion: Record<SentenceLabel, Record<SentenceLabel, number>>;
  disagreements: Array<{ sentence: string; person: SentenceLabel; model: SentenceLabel }>;
  /** Sentences the person marked for Orbit that the model did not, and so would not reach the walk. */
  lostFromTheWalk: string[];
};

const FOR_ORBIT = new Set<SentenceLabel>(['task', 'rule']);

export function score(
  person: Readonly<Record<string, SentenceLabel>>, model: ReadonlyMap<string, SentenceLabel>,
): Scored {
  const confusion = Object.fromEntries(SENTENCE_LABELS.map((p) =>
    [p, Object.fromEntries(SENTENCE_LABELS.map((m) => [m, 0]))])) as Scored['confusion'];
  const disagreements: Scored['disagreements'] = [];
  const lostFromTheWalk: string[] = [];
  let agreed = 0;

  for (const [sentence, p] of Object.entries(person)) {
    const m = model.get(sentence);
    if (!m) throw new Error(`the sort has no label for ${sentence}, which the person labelled`);
    confusion[p][m] += 1;
    if (p === m) agreed += 1;
    else disagreements.push({ sentence, person: p, model: m });
    if (FOR_ORBIT.has(p) && !FOR_ORBIT.has(m)) lostFromTheWalk.push(sentence);
  }
  return { total: Object.keys(person).length, agreed, confusion, disagreements, lostFromTheWalk };
}
