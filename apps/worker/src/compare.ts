/**
 * Deciding whether a comparison holds, and refusing when it cannot be decided.
 *
 * This existed only for absence. Everything else fell through to `left !== null`
 * — so a branch on "credit score is more than 700" evaluated as "was a credit
 * score there at all", took the yes path on any value, and recorded that the
 * comparison had gone that way. A wrong answer delivered confidently is the
 * one failure this product cannot absorb, and a default that silently means
 * something else is how you get one.
 *
 * So there is no default here. Every combination of type and operator is
 * written out, and anything that cannot be decided is `comparisonNotPossible`
 * or `valueNotOfDeclaredType` rather than a guess.
 */
import type { Comparison, ErrorKind } from '@orbit/contract';

export type Decided =
  /** Both operands as they arrived, for the record §10 asks for. */
  | { decided: true; held: boolean; left: string | null; right: string | null }
  | { decided: false; kind: ErrorKind; describe: string };

/**
 * A number, read off a screen.
 *
 * A screen does not show numbers; it shows "32.50%", "$457,500", "744". The
 * declared type says what the author means it to be, and this is where the two
 * meet. Grouping separators and a single currency or percent sign are removed,
 * because they are how the same number is written for a person, and nothing
 * else is — "about 700", "N/A" and "700-750" are refused rather than salvaged.
 *
 * The raw text is never discarded. `valueNotOfDeclaredType` exists precisely
 * so that a mis-declared value can be fixed by looking at what the screen
 * actually said, and a parse that threw the evidence away would defeat it.
 */
export function asNumber(raw: string): number | null {
  const cleaned = raw.trim()
    .replace(/^[$£€]/, '')
    .replace(/%$/, '')
    .replaceAll(',', '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Resolves one side of a comparison to the text it holds, or absence. */
type Resolve = (ref: Comparison['left']) => string | null;

export function decide(when: Comparison, resolve: Resolve): Decided {
  const left = resolve(when.left);

  if (when.of === 'absence') {
    return { decided: true, left, right: null,
      held: when.operator === 'isAbsent' ? left === null : left !== null };
  }

  if (when.of === 'listOfRows') {
    return { decided: false, kind: 'comparisonNotPossible',
      describe: 'Comparing a list is not carried out yet, so this cannot be decided.' };
  }

  const right = resolve(when.right);

  // Absence is the only comparison allowed against a value that was never
  // produced (Decision 14 item 2). Everything else halts, because "the record
  // said nothing" is not a value to compare and pretending otherwise is how it
  // collapses into "there was no record".
  if (left === null || right === null) {
    const missing = left === null ? 'left' : 'right';
    return { decided: false, kind: 'comparisonNotPossible',
      describe: `The ${missing} side of this comparison is absent, and only absence may be compared with absence.` };
  }

  switch (when.of) {
    case 'text':
      switch (when.operator) {
        case 'is':         return { decided: true, held: left === right, left, right };
        case 'isNot':      return { decided: true, held: left !== right, left, right };
        case 'contains':   return { decided: true, held: left.includes(right), left, right };
        case 'startsWith': return { decided: true, held: left.startsWith(right), left, right };
      }
      break;

    case 'number': {
      const a = asNumber(left);
      const b = asNumber(right);
      if (a === null || b === null) {
        const which = a === null ? left : right;
        return { decided: false, kind: 'valueNotOfDeclaredType',
          describe: `"${which}" was compared as a number, and it is not one. The text is kept as it was read.` };
      }
      switch (when.operator) {
        case 'is':         return { decided: true, held: a === b, left, right };
        case 'isNot':      return { decided: true, held: a !== b, left, right };
        case 'isMoreThan': return { decided: true, held: a > b,  left, right };
        case 'isAtLeast':  return { decided: true, held: a >= b, left, right };
        case 'isLessThan': return { decided: true, held: a < b,  left, right };
        case 'isAtMost':   return { decided: true, held: a <= b, left, right };
      }
      break;
    }

    case 'date': {
      const a = Date.parse(left);
      const b = Date.parse(right);
      if (Number.isNaN(a) || Number.isNaN(b)) {
        return { decided: false, kind: 'valueNotOfDeclaredType',
          describe: `"${Number.isNaN(a) ? left : right}" was compared as a date, and it is not one.` };
      }
      switch (when.operator) {
        case 'is':       return { decided: true, held: a === b, left, right };
        case 'isNot':    return { decided: true, held: a !== b, left, right };
        case 'isBefore': return { decided: true, held: a < b,   left, right };
        case 'isAfter':  return { decided: true, held: a > b,   left, right };
      }
      break;
    }

    case 'yesNo': {
      // Only the two words the type admits. "1", "on" and "checked" are things
      // a page might say and not things this type means, and guessing which
      // way they go is how a decision quietly inverts.
      const yes = new Set(['yes', 'true']);
      const no = new Set(['no', 'false']);
      const read = (v: string) => (yes.has(v.trim().toLowerCase()) ? true
        : no.has(v.trim().toLowerCase()) ? false : null);
      const a = read(left);
      const b = read(right);
      if (a === null || b === null) {
        return { decided: false, kind: 'valueNotOfDeclaredType',
          describe: `"${a === null ? left : right}" was compared as yes or no, and it is neither.` };
      }
      return { decided: true, held: when.operator === 'is' ? a === b : a !== b, left, right };
    }
  }

  return { decided: false, kind: 'comparisonNotPossible',
    describe: 'This comparison has no meaning for the type it declares.' };
}
