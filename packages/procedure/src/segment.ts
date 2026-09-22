/**
 * Splits a procedure into the sentences a model will label, by number.
 *
 * The one rule this file exists to keep: **Orbit never rewrites the author's
 * words.** A sentence is a span of the text as written, `source.slice(start,
 * end)`, and every character that is not whitespace falls inside exactly one
 * of them. Nothing is dropped, tidied, joined or re-ordered, so "every
 * sentence has exactly one label" is a statement about the whole document
 * rather than about whatever survived splitting.
 *
 * Everything else here is judgement about where one thing the author said ends
 * and the next begins, and it is allowed to be wrong in the way a person can
 * see and correct: a sentence split in two, or two run together. It is not
 * allowed to be wrong in the way nobody sees, which is losing text.
 */

export type SentenceKind =
  /** Running text. */
  | 'prose'
  /** A line that names a section rather than saying anything: "Escalation", "## B. Rules". */
  | 'heading'
  /** The first sentence of a bullet or numbered step. */
  | 'item'
  /** Ends in a colon, introducing what follows: "Check the following:". */
  | 'leadIn';

export type Segmented = {
  n: number;
  text: string;
  start: number;
  end: number;
  kind: SentenceKind;
  /**
   * The text stops mid-sentence: the last one, with no full stop, that is not a
   * heading or a step. A part pasted up to a page break ends like this, and the
   * next part carries on from it.
   */
  unterminated: boolean;
};

/** `- `, `* `, `• `, `1. `, `1) `, `a) `, `(a) `, `(iv) `, `Step 3: `. */
const ITEM = /^(?:[-*•▪◦·]|\d{1,3}[.)]|[a-zA-Z][.)]|\(\w{1,4}\)|step\s+\d{1,3}[:.)])\s+/i;
const MARKDOWN_HEADING = /^#{1,6}\s/;
/** A line of dashes, underscores, stars or equals signs. */
const RULE_LINE = /^[-_*=]{3,}$/;

/**
 * Words a full stop follows without ending anything. `etc.` is not here: it
 * ends a list, and a list often ends the sentence ("letters, forms, etc. Then
 * sign out."), so it is left to what comes next.
 */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'vs', 'approx', 'inc', 'ltd', 'co', 'corp',
  'dept', 'fig', 'ref', 'min', 'max', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug',
  'sep', 'sept', 'oct', 'nov', 'dec',
]);

/** A line ending on one of these runs on into the next, so it is not a heading. */
const CONNECTORS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
  'by', 'from', 'as', 'if', 'than', 'that', 'is', 'are', 'be', 'not', 'into', 'onto', 'per',
]);

const CLOSERS = `"')]’”»`;
const OPENERS = `"'([“‘«$#`;
const TERMINATED = /[.?!][\s"')\]’”»]*$/;

/** A line's words: where they start and end in the source, blank lines having none. */
type Line = { start: number; end: number; content: string };
type Block = { start: number; end: number; kind: 'prose' | 'heading' | 'item' };

export function segment(source: string): Segmented[] {
  const out: Segmented[] = [];
  for (const block of blocks(lines(source))) {
    const kindOf = (e: number, first: boolean): SentenceKind => {
      if (block.kind === 'heading') return 'heading';
      if (source[e - 1] === ':') return 'leadIn';
      return first && block.kind === 'item' ? 'item' : 'prose';
    };

    if (block.kind === 'heading') {
      out.push(unit(source, block.start, block.end, 'heading'));
      continue;
    }

    let start = block.start;
    let first = true;
    for (let i = afterMarker(source, start, block.end); i < block.end; i++) {
      const end = sentenceEndsAt(source, i, block.end, start);
      if (end === null) continue;
      const next = firstNonSpace(source, end, block.end);
      if (next === block.end) break;
      out.push(unit(source, start, end, kindOf(end, first)));
      first = false;
      start = next;
      i = afterMarker(source, start, block.end) - 1;
    }
    const end = lastNonSpace(source, start, block.end);
    out.push(unit(source, start, end, kindOf(end, first)));
  }

  return out.map((s, i) => ({
    ...s,
    n: i + 1,
    unterminated: i === out.length - 1 && (s.kind === 'prose' || s.kind === 'leadIn') && !TERMINATED.test(s.text),
  }));
}

function unit(source: string, start: number, end: number, kind: SentenceKind): Segmented {
  return { n: 0, text: source.slice(start, end), start, end, kind, unterminated: false };
}

function lines(source: string): Line[] {
  const found: Line[] = [];
  let start = 0;
  for (let i = 0; i <= source.length; i++) {
    if (i === source.length || source[i] === '\n') {
      const raw = source.slice(start, i);
      const content = raw.trim();
      const lead = raw.length - raw.trimStart().length;
      found.push({ start: start + lead, end: start + lead + content.length, content });
      start = i + 1;
    }
  }
  return found;
}

/**
 * Groups lines into things that are split no further than into sentences: a
 * paragraph, one bullet or step with its wrapped continuation lines, or a
 * heading. A procedure pasted from a PDF is hard-wrapped, so a line break on
 * its own ends nothing.
 */
function blocks(all: Line[]): Block[] {
  const found: Block[] = [];
  let open: { start: number; end: number; kind: 'prose' | 'item' } | null = null;
  const close = () => { if (open) found.push({ start: open.start, end: open.end, kind: open.kind }); open = null; };

  all.forEach((line, index) => {
    const text = line.content;
    if (text === '') { close(); return; }

    const span = { start: line.start, end: line.end };

    if (MARKDOWN_HEADING.test(text) || RULE_LINE.test(text)) {
      close();
      found.push({ ...span, kind: 'heading' });
      return;
    }
    if (ITEM.test(text)) {
      close();
      open = { ...span, kind: 'item' };
    } else if (!open && isHeading(text, all[index + 1]?.content ?? '')) {
      found.push({ ...span, kind: 'heading' });
      return;
    } else if (open) {
      open.end = span.end;
    } else {
      open = { ...span, kind: 'prose' };
    }
    // A colon at the end of a line introduces what follows, which is its own —
    // unless the next line carries on in lower case, which is a wrapped line
    // that happened to break after the colon.
    const next = all[index + 1]?.content ?? '';
    if (text.endsWith(':') && (next === '' || ITEM.test(next) || /^[A-Z0-9"“(#]/.test(next))) close();
  });
  close();
  return found;
}

/**
 * A short line that names a section. Judged only at the start of a block, and
 * only when it could not be the first line of a wrapped sentence: it says
 * nothing ending in punctuation, does not stop on a word that runs on, and what
 * follows begins afresh.
 */
function isHeading(text: string, next: string): boolean {
  if (text.length > 60 || text.split(/\s+/).length > 8) return false;
  if (!/^[A-Z0-9]/.test(text)) return false;
  if (/[.?!:;,]["')\]’”»]*$/.test(text)) return false;
  const last = text.split(/\s+/).at(-1)!.toLowerCase().replace(/[^a-z]/g, '');
  if (CONNECTORS.has(last)) return false;
  return next === '' || ITEM.test(next) || MARKDOWN_HEADING.test(next) || /^[A-Z0-9"“(]/.test(next);
}

/** Where scanning for a sentence's end begins: past a bullet or step number, which is not a sentence. */
function afterMarker(source: string, start: number, limit: number): number {
  const match = ITEM.exec(source.slice(start, Math.min(limit, start + 16)));
  return match ? start + match[0].length : start;
}

/**
 * If a sentence ends at the mark at `i`, where it ends (after any closing
 * quote or bracket); otherwise null.
 */
function sentenceEndsAt(source: string, i: number, limit: number, sentenceStart: number): number | null {
  const c = source[i]!;
  if (c !== '.' && c !== '?' && c !== '!') return null;
  // An ellipsis trails off; it does not end a sentence.
  if (c === '.' && (source[i + 1] === '.' || source[i - 1] === '.')) return null;

  let end = i + 1;
  while (end < limit && CLOSERS.includes(source[end]!)) end++;
  if (end < limit && !/\s/.test(source[end]!)) return null;

  const next = firstNonSpace(source, end, limit);
  if (next < limit) {
    const n = source[next]!;
    if (!(/[A-Z0-9]/.test(n) || OPENERS.includes(n))) return null;
  }

  if (c === '.') {
    const word = wordBefore(source, i, sentenceStart);
    const bare = word.toLowerCase().replace(/^[^a-z0-9]+/, '');
    if (ABBREVIATIONS.has(bare)) return null;
    // e.g., i.e., U.S., a.m. — letters separated by stops.
    if (/^[a-z](?:\.[a-z])+$/.test(bare)) return null;
    // "J. Smith": a lone capital is an initial.
    if (/^[A-Z]$/.test(word)) return null;
    // "No. 5", "Nos. 3 and 4".
    if ((bare === 'no' || bare === 'nos') && /\d/.test(source[next] ?? '')) return null;
  }
  return end;
}

function wordBefore(source: string, i: number, floor: number): string {
  let s = i;
  while (s > floor && !/\s/.test(source[s - 1]!)) s--;
  return source.slice(s, i);
}

function firstNonSpace(source: string, from: number, limit: number): number {
  let i = from;
  while (i < limit && /\s/.test(source[i]!)) i++;
  return i;
}

function lastNonSpace(source: string, floor: number, limit: number): number {
  let i = limit;
  while (i > floor && /\s/.test(source[i - 1]!)) i--;
  return i;
}
