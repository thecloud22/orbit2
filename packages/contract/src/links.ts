/**
 * A value named in the author's words (Decision 20): a phrase of one sentence,
 * and the value it means. "the credit score" in 1.10 is creditScore.
 *
 * The author gives a link, or Orbit shows its guess, worked out here with no
 * model from what it already holds: a table's column found in its rule
 * sentences, and a read step's label found in the line it carries out. A
 * guess is shown, never used as the author's word. Only the author's links
 * reach the tables, the walk and the compile.
 *
 * A link never changes the words. It is kept beside the sentence, and it is
 * current only while its phrase is in the sentence exactly once: a revision
 * that drops the phrase drops the link, and nothing is rewritten.
 */
import { name, object, z } from './zod.ts';
import { sentenceNumber, type RuleTable } from './procedure.ts';

export const valueLinkAsked = object({
  sentence: sentenceNumber,
  phrase: z.string().min(1).max(200),
  /** The value the phrase means, or null: it is not a value. */
  value: name.nullable(),
});

/** Several at once: confirming Orbit's guesses one after another would wait on the sort between each. */
export const valueLinksAsked = z.union([valueLinkAsked, object({ links: z.array(valueLinkAsked).min(1).max(50) })]);

/** Links carried by a revision or a new sentence: the words they name are in the text being kept. */
export const wordLinks = z.array(object({ phrase: z.string().min(1).max(200), value: name.nullable() })).max(20);

export type ValueLink = { sentence: string; phrase: string; value: string | null; by: 'author' | 'orbit' };

/** Where a phrase is in a sentence, exactly as written: its one place, or why it has none (L1). */
export function placeOf(text: string, phrase: string): { at: number } | { refused: 'absent' | 'twice' } {
  const at = phrase ? text.indexOf(phrase) : -1;
  if (at < 0) return { refused: 'absent' };
  if (text.indexOf(phrase, at + 1) >= 0) return { refused: 'twice' };
  return { at };
}

/** Why a link to a phrase was refused, in words the author can act on. */
export function placeRefusal(sentence: string, phrase: string, refused: 'absent' | 'twice'): string {
  return refused === 'absent'
    ? `"${phrase}" is not in ${sentence} as it now reads. Choose words that are.`
    : `"${phrase}" is in ${sentence} more than once, so it names neither. Choose more of the words around it.`;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The phrase in a sentence that names a label, as the sentence writes it:
 * "Loan program" in "3. Read the loan program, the credit score…" is "the
 * loan program". Case is ignored, word edges are not, and a leading "the" is
 * taken with it. Only a label found exactly once gives a phrase.
 */
export function phraseFor(text: string, label: string): string | null {
  const wanted = label.trim();
  if (!wanted) return null;
  const found = [...text.matchAll(new RegExp(`(?<![\\w-])${escape(wanted)}(?![\\w-])`, 'gi'))];
  if (found.length !== 1) return null;
  const at = found[0]!.index!;
  const the = at >= 4 && /^the $/i.test(text.slice(at - 4, at)) && !/[\w-]/.test(text.charAt(at - 5));
  const phrase = text.slice(the ? at - 4 : at, at + wanted.length);
  return 'at' in placeOf(text, phrase) ? phrase : null;
}

const overlaps = (a: { at: number; phrase: string }, b: { at: number; phrase: string }) =>
  a.at < b.at + b.phrase.length && b.at < a.at + a.phrase.length;

/**
 * The links that hold for the words as they now stand: the author's latest for
 * each phrase still in its sentence once, then Orbit's guesses where the
 * author has said nothing about those words (L4). Only task and rule
 * sentences have any (L3).
 */
export function linksOf(opts: {
  sentences: ReadonlyArray<{ number: string; text: string; label: string | null; withdrawn?: boolean }>;
  /** The author's links, oldest first: the latest for a phrase is the one that holds. */
  authored: ReadonlyArray<{ sentence: string; phrase: string; value: string | null }>;
  tables: ReadonlyArray<RuleTable>;
  reads: ReadonlyArray<{ sentence: string | null; label: string; name: string }>;
}): ValueLink[] {
  const textOf = new Map(opts.sentences
    .filter((s) => !s.withdrawn && (s.label === 'task' || s.label === 'rule')).map((s) => [s.number, s.text]));
  const latest = new Map<string, { sentence: string; phrase: string; value: string | null }>();
  for (const a of opts.authored) latest.set(`${a.sentence}\u0000${a.phrase}`, a);
  const placed: Array<ValueLink & { at: number }> = [];
  for (const a of latest.values()) {
    const text = textOf.get(a.sentence);
    const where = text === undefined ? null : placeOf(text, a.phrase);
    if (where && 'at' in where) placed.push({ ...a, by: 'author', at: where.at });
  }

  // Orbit's guesses: what a read step produces first, since that value
  // exists; then a table column, which is what a rule compares. A column
  // labelled as a read is guessed to be that read, so the same words are
  // never guessed as two names: confirming both would give one fact two.
  const bare = (l: string) => l.trim().toLowerCase().replace(/^the\s+/, '');
  const guesses: Array<{ sentence: string; label: string; value: string }> = [
    ...opts.reads.flatMap((r) => (r.sentence ? [{ sentence: r.sentence, label: r.label, value: r.name }] : [])),
    ...opts.tables.flatMap((t) => t.columns.flatMap((c) => {
      const read = opts.reads.find((r) => bare(r.label) === bare(c.label));
      return [...new Set([...t.sentences, ...t.rows.map((r) => r.sentence), ...(c.readBy ? [c.readBy] : [])])]
        .map((sentence) => ({ sentence, label: c.label, value: read?.name ?? c.name }));
    })),
  ];
  for (const g of guesses) {
    const text = textOf.get(g.sentence);
    const phrase = text === undefined ? null : phraseFor(text, g.label);
    if (!phrase) continue;
    const at = text!.indexOf(phrase);
    if (placed.some((p) => p.sentence === g.sentence && overlaps(p, { at, phrase }))) continue;
    placed.push({ sentence: g.sentence, phrase, value: g.value, by: 'orbit', at });
  }
  const order = [...textOf.keys()];
  return placed
    .sort((a, b) => order.indexOf(a.sentence) - order.indexOf(b.sentence) || a.at - b.at)
    .map(({ at: _, ...l }) => l);
}

/** The author's links that name a value, in the given sentences: what the tables, the walk and the compile are held to. */
export function namedIn(links: readonly ValueLink[], sentences: readonly string[]):
  Array<{ sentence: string; phrase: string; value: string }> {
  return links.flatMap((l) => (l.by === 'author' && l.value && sentences.includes(l.sentence)
    ? [{ sentence: l.sentence, phrase: l.phrase, value: l.value }] : []));
}
