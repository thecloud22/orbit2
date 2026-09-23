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

/**
 * A rule, as a table (2.1-d). A review surface: it says what the procedure's
 * rule sentences decide, in a shape a person can check at a glance. Columns
 * are values; each names the task sentence that reads it, or none — and a
 * rule comparing something no task reads cannot be confirmed (criterion 5),
 * because nothing would ever have the value to compare.
 */
export const RULE_COMPARISONS = [
  'is', 'isNot', 'isMoreThan', 'isAtLeast', 'isLessThan', 'isAtMost', 'isBefore', 'isAfter', 'isAbsent', 'isPresent',
] as const;
export const ruleComparison = z.enum(RULE_COMPARISONS);

export const ruleTable = object({
  question: z.string().trim().min(1).max(200),
  columns: z.array(object({
    name: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'a value is named in camelCase').max(64),
    label: z.string().trim().min(1).max(120),
    readBy: sentenceNumber.nullable(),
  })).min(1).max(12),
  rows: z.array(object({
    when: z.array(object({ column: z.string(), is: ruleComparison, value: z.string().max(120).nullable() })).min(1).max(12),
    then: z.string().trim().min(1).max(200),
    sentence: sentenceNumber,
  })).min(1).max(40),
  otherwise: object({ then: z.string().trim().min(1).max(200), sentence: sentenceNumber.nullable() }).nullable(),
  sentences: z.array(sentenceNumber).min(1),
});
export type RuleTable = z.infer<typeof ruleTable>;

/**
 * Keeps a set of tables only if it accounts for every rule sentence exactly
 * once and refers to nothing it was not given. Every problem is named.
 */
export function checkRuleTables(
  ruleSentences: readonly string[], taskSentences: readonly string[], answer: unknown,
  /** The values the author named in rule sentences (Decision 20): each is a column of the table citing its sentence. */
  named: ReadonlyArray<{ sentence: string; phrase: string; value: string }> = [],
): { ok: true; tables: RuleTable[] } | { ok: false; problems: string[] } {
  const parsed = z.array(ruleTable).safeParse(answer);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join('.') || 'answer'}: ${i.message}`) };
  }
  const problems: string[] = [];
  const rules = new Set(ruleSentences);
  const tasks = new Set(taskSentences);
  const seen = new Map<string, number>();
  parsed.data.forEach((t, i) => {
    const which = `table ${i + 1}`;
    for (const n of t.sentences) {
      if (!rules.has(n)) problems.push(`${which} cites ${n}, which is not a rule sentence`);
      seen.set(n, (seen.get(n) ?? 0) + 1);
    }
    const columns = new Set(t.columns.map((c) => c.name));
    if (columns.size !== t.columns.length) problems.push(`${which} names a column twice`);
    for (const c of t.columns) {
      if (c.readBy !== null && !tasks.has(c.readBy)) problems.push(`${which}: "${c.label}" is said to be read by ${c.readBy}, which is not a task`);
    }
    for (const [r, row] of t.rows.entries()) {
      if (!t.sentences.includes(row.sentence)) problems.push(`${which} row ${r + 1} cites ${row.sentence}, which the table does not`);
      for (const w of row.when) {
        if (!columns.has(w.column)) problems.push(`${which} row ${r + 1} compares "${w.column}", which is not one of its columns`);
        const needsValue = w.is !== 'isAbsent' && w.is !== 'isPresent';
        if (needsValue && !w.value) problems.push(`${which} row ${r + 1} compares "${w.column}" with nothing`);
      }
    }
    if (t.otherwise?.sentence && !t.sentences.includes(t.otherwise.sentence)) {
      problems.push(`${which}'s otherwise cites ${t.otherwise.sentence}, which the table does not`);
    }
    for (const n of named.filter((x) => t.sentences.includes(x.sentence) && !columns.has(x.value))) {
      problems.push(`${which}: ${n.sentence} says "${n.phrase}" is ${n.value}, and no column is named ${n.value}`);
    }
  });
  for (const n of ruleSentences) {
    const count = seen.get(n) ?? 0;
    if (count === 0) problems.push(`rule sentence ${n} is in no table`);
    if (count > 1) problems.push(`rule sentence ${n} is in ${count} tables`);
  }
  return problems.length ? { ok: false, problems } : { ok: true, tables: parsed.data };
}

/** A rule table as kept, with the number it is known by: BR1, and BR1.1 for its first row. */
export type NumberedRuleTable = RuleTable & { id: number };

/** A kept table's number. Sets kept before numbers were stored are numbered by their place. */
export const tableNumber = (t: RuleTable & { id?: number }, i: number): number => t.id ?? i + 1;

/**
 * Numbers a set of tables just made so that a rule keeps its number when the
 * tables are made again. They are made again after every sort and relabel,
 * and a number counted from a table's place moved with every removed
 * sentence: in one draft, BR2 was the file decision, then the flood rule a
 * minute later, then the file decision again.
 *
 * A table takes the number of the earlier table it shares the most rule
 * sentences with, the lower number on a tie, and each number goes to one
 * table. A table that shares none takes the next number never given, so a
 * number that has gone is never reused for a different rule.
 */
export function numberTables(
  tables: readonly RuleTable[], before: ReadonlyArray<{ id: number; sentences: readonly string[] }>, highest: number,
): NumberedRuleTable[] {
  const pairs = tables.flatMap((t, i) => before.map((b) => ({
    i, id: b.id, shared: t.sentences.filter((n) => b.sentences.includes(n)).length,
  }))).filter((p) => p.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.id - b.id || a.i - b.i);
  const given = new Map<number, number>();
  const taken = new Set<number>();
  for (const p of pairs) {
    if (given.has(p.i) || taken.has(p.id)) continue;
    given.set(p.i, p.id);
    taken.add(p.id);
  }
  let next = Math.max(highest, ...before.map((b) => b.id), 0);
  return tables.map((t, i) => ({ ...t, id: given.get(i) ?? ++next }));
}

/** Columns no task reads: each one blocks confirmation until it is resolved. */
export function unreadColumns(tables: ReadonlyArray<RuleTable & { id?: number }>):
  Array<{ table: number; question: string; label: string; sentences: string[] }> {
  return tables.flatMap((t, i) => t.columns.filter((c) => c.readBy === null)
    .map((c) => ({ table: tableNumber(t, i), question: t.question, label: c.label, sentences: t.sentences })));
}

/**
 * What to tell an author whose confirmation a column nobody reads is blocking:
 * which sentences, and the ways out. A block that does not say how to lift it
 * is a dead end, and the first person to meet this one was stuck on it.
 */
export function unreadAdvice(unread: ReturnType<typeof unreadColumns>): string {
  const which = unread.map((c) => `"${c.label}" (${c.sentences.join(', ')})`).join(' and ');
  return `No task reads ${which}. If a sentence only explains something or points elsewhere, mark it Background; `
    + 'if a person checks it, mark it For a person; if Orbit should check it, add a sentence that reads it.';
}
