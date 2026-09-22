/**
 * A procedure held as numbered sentences, and what each one is for.
 *
 * Orbit 2.1's first step: the text is split by Orbit, and a model only says
 * which of five things each numbered sentence is. It answers by number, so it
 * has no way to add a sentence, drop one or reword one — and a labelling that
 * tries is refused whole, naming every sentence it got wrong.
 */
import { object, z } from './zod.ts';

/** What a sentence is for. Exactly one each; nothing is left unplaced. */
export const SENTENCE_LABELS = ['task', 'rule', 'forAPerson', 'background', 'wontDo'] as const;
export const sentenceLabel = z.enum(SENTENCE_LABELS);
export type SentenceLabel = z.infer<typeof sentenceLabel>;

/** Where a part of the procedure came from. `author` is text typed into the chat. */
export const PART_SOURCES = ['pasted', 'pdf', 'author'] as const;
export const partSource = z.enum(PART_SOURCES);
export type PartSource = z.infer<typeof partSource>;

/** Whether the document says so, or Orbit concluded it. */
export const LABEL_BASES = ['stated', 'inferred'] as const;
export const labelBasis = z.enum(LABEL_BASES);
export type LabelBasis = z.infer<typeof labelBasis>;

/**
 * A part's key: `1`, `2`… for the document, `A`, `B`… for the author's own
 * words. Two sequences rather than one, so that a sentence's number says on its
 * face whether the document said it.
 */
export const partKey = z.string().regex(/^(?:[1-9]\d{0,3}|[A-Z]{1,2})$/, 'a part is 1, 2… or A, B…');

/**
 * `2.14` is the fourteenth sentence of part 2. Numbered within the part, so
 * adding a part never renumbers anything already referred to.
 */
export const sentenceNumber = z.string().regex(
  /^(?:[1-9]\d{0,3}|[A-Z]{1,2})\.[1-9]\d{0,4}$/, 'a sentence is numbered like 2.14 or A.1');

export function numberOf(part: string, n: number): string {
  return `${part}.${n}`;
}

/** The key the next part takes: the next number for the document, the next letter for the author. */
export function nextPartKey(taken: readonly string[], source: PartSource): string {
  if (source !== 'author') {
    const numbers = taken.filter((k) => /^\d+$/.test(k)).map(Number);
    return String(numbers.length === 0 ? 1 : Math.max(...numbers) + 1);
  }
  const letters = new Set(taken.filter((k) => /^[A-Z]+$/.test(k)));
  for (let i = 0; i < 26 * 27; i++) {
    const key = i < 26
      ? String.fromCharCode(65 + i)
      : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
    if (!letters.has(key)) return key;
  }
  throw new Error('a draft has run out of part letters');
}

/** One sentence's label, as a model or an author gives it. */
export const labelEntry = object({
  sentence: sentenceNumber,
  label: sentenceLabel,
  reason: z.string().trim().min(1).max(500),
  basis: labelBasis,
});
export type LabelEntry = z.infer<typeof labelEntry>;

export const labelling = z.array(labelEntry);

export type LabellingChecked =
  | { ok: true; labels: LabelEntry[] }
  | { ok: false; skipped: string[]; duplicated: string[]; invented: string[]; malformed?: string };

/**
 * Keeps a labelling only if it places every expected sentence exactly once and
 * mentions nothing else. Every problem is named, not the first: a person fixing
 * a prompt, or reading why a turn was refused, needs the whole list.
 */
export function checkLabelling(expected: readonly string[], answer: unknown): LabellingChecked {
  const parsed = labelling.safeParse(answer);
  if (!parsed.success) {
    return {
      ok: false, skipped: [], duplicated: [], invented: [],
      malformed: parsed.error.issues.map((i) => `${i.path.join('.') || 'answer'}: ${i.message}`).join('; '),
    };
  }

  const wanted = new Set(expected);
  const seen = new Map<string, number>();
  for (const entry of parsed.data) seen.set(entry.sentence, (seen.get(entry.sentence) ?? 0) + 1);

  const skipped = expected.filter((n) => !seen.has(n));
  const duplicated = [...seen].filter(([n, count]) => count > 1 && wanted.has(n)).map(([n]) => n);
  const invented = [...seen.keys()].filter((n) => !wanted.has(n));

  if (skipped.length || duplicated.length || invented.length) {
    return { ok: false, skipped, duplicated, invented };
  }
  return { ok: true, labels: parsed.data };
}

export type Coverage = {
  total: number;
  placed: number;
  byLabel: Record<SentenceLabel, number>;
  unplaced: string[];
};

/** Counted from the labels, never estimated. */
export function coverage(
  sentences: readonly string[],
  labels: ReadonlyMap<string, SentenceLabel>,
): Coverage {
  const byLabel = Object.fromEntries(SENTENCE_LABELS.map((l) => [l, 0])) as Record<SentenceLabel, number>;
  const unplaced: string[] = [];
  for (const n of sentences) {
    const label = labels.get(n);
    if (label) byLabel[label] += 1;
    else unplaced.push(n);
  }
  return { total: sentences.length, placed: sentences.length - unplaced.length, byLabel, unplaced };
}
