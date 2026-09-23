/**
 * A 3270 screen, as Orbit reads it (Orbit 2.2, C6, C8, C9).
 *
 * Built from s3270's `ReadBuffer(Ascii)`: every cell, and where each field
 * begins with its attribute byte. From that come the things the walk shows the
 * model — labels, fields, values, keys — the screen's identity, and the
 * binding a published step finds its field by again.
 */
import type { Seen } from '../snapshot.ts';

export interface Field {
  /** Where the field's attribute byte sits. */
  attrRow: number;
  attrColumn: number;
  /** Where its data begins, which is what a cursor is moved to. */
  row: number;
  column: number;
  length: number;
  protected: boolean;
  /** Non-display: a password. Its content is never read (C9). */
  hidden: boolean;
  intense: boolean;
  text: string;
}

export interface Screen {
  rows: number;
  columns: number;
  /** The screen as text, a row per line, with every hidden field blanked. */
  lines: string[];
  fields: Field[];
  /** What names this screen: its code (LSV20) or else its title. */
  identity: string;
  /** Where the host left the cursor, when the emulator said. */
  cursor?: { row: number; column: number };
  /**
   * A screen the host writes line by line, as TSO does while it signs a
   * person on: nothing on it is protected, earlier prompts stay where they
   * were written, and the one field that is live is the one with the cursor.
   */
  lineMode: boolean;
}

/**
 * How a green-screen step finds its field again (Decision 18, draft).
 * `screen` must match, the label must be found exactly once, and its address
 * must agree; anything else is a refusal.
 */
export interface TerminalBinding {
  connector: 'tn3270';
  screen: string;
  what: 'field' | 'value' | 'key';
  /** The label beside a field or value, as the screen writes it (cleaned). */
  label?: string;
  /** A key's name: ENTER, CLEAR, PA1–PA3, PF1–PF24. */
  key?: string;
  row: number;
  column: number;
  length: number;
}

const KEY = /^(ENTER|CLEAR|PA[1-3]|PF(?:[1-9]|1\d|2[0-4]))=(.+)$/;
/** A label ends in an arrow, a colon, or the dot leaders of CUA panels ("Loan number . . ."). */
const LABEL = /(={1,3}>|:|(?:\.\s?){2,})\s*$/;
const CODE = /^[A-Z]{2,5}\d{1,4}[A-Z]?$/;
/** A clock or a date is on every screen and names none of them. */
const CLOCK = /^(date|time|\d{1,4}[./:-]\d{1,2}[./:-]\d{1,4})$/i;
/** TSO's "more to come; press Enter" (Orbit 2.3). */
export const PAUSE = '***';

/** "LOAN NUMBER  ===>", "LTV          :" and "Loan number . . ." name "LOAN NUMBER", "LTV" and "Loan number". */
export function cleanLabel(text: string): string {
  return text.replace(LABEL, '').replace(/\s+/g, ' ').trim();
}

/** "ENTER CURRENT PASSWORD FOR HERC02-" and "IKJ56700A ENTER USERID -" as the names of what they ask for. */
function cleanPrompt(text: string): string {
  return text.trim().replace(/\s*[-?:]\s*$/, '').replace(/\s+/g, ' ').trim();
}

/** Parses `ReadBuffer(Ascii)` rows into cells and fields. */
export function parseBuffer(rows: string[], cursor?: { row: number; column: number }): Screen {
  const height = rows.length;
  const cells: Array<{ ch: string; attr: number | null }> = [];
  let width = 0;
  for (const row of rows) {
    const tokens = row.trim().split(/\s+/).filter((t) => t && !t.startsWith('SA('));
    width = Math.max(width, tokens.length);
    for (const t of tokens) {
      const sf = /^SF\(([^)]*)\)$/.exec(t);
      if (sf) {
        const c0 = /c0=([0-9a-f]{2})/i.exec(sf[1] ?? '');
        cells.push({ ch: ' ', attr: c0 ? parseInt(c0[1]!, 16) : 0 });
      } else {
        const code = parseInt(t, 16);
        cells.push({ ch: code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : ' ', attr: null });
      }
    }
  }
  const columns = width || 80;
  const at = (i: number) => ({ row: Math.floor(i / columns), column: i % columns });

  const fields: Field[] = [];
  const starts = cells.map((c, i) => (c.attr !== null ? i : -1)).filter((i) => i >= 0);
  for (const [n, start] of starts.entries()) {
    const end = n + 1 < starts.length ? starts[n + 1]! : cells.length;
    const attr = cells[start]!.attr!;
    const hidden = (attr & 0x0c) === 0x0c;
    const data = start + 1;
    const text = hidden ? '' : cells.slice(data, end).map((c) => c.ch).join('');
    const { row: attrRow, column: attrColumn } = at(start);
    const { row, column } = at(Math.min(data, cells.length - 1));
    fields.push({ attrRow, attrColumn, row, column, length: Math.max(0, end - data),
      protected: (attr & 0x20) !== 0, hidden, intense: (attr & 0x0c) === 0x08, text });
  }

  // The text a person sees, with every hidden field's cells blanked.
  const shown = cells.map((c) => c.ch);
  for (const f of fields.filter((x) => x.hidden)) {
    for (let i = 0; i < f.length; i++) shown[f.row * columns + f.column + i] = ' ';
  }
  const lines = Array.from({ length: height }, (_, r) => shown.slice(r * columns, (r + 1) * columns).join(''));

  const lineMode = fields.every((f) => !f.protected);
  const screen: Screen = { rows: height, columns, lines, fields, identity: '', lineMode, ...(cursor ? { cursor } : {}) };
  return { ...screen, identity: identityOf(screen) };
}

/**
 * The screen's code where it shows one (row 0); else its title — words, not a
 * clock, on rows 1–3 and then row 0; else, on a screen the host writes line
 * by line, what it is asking for; else what its first field is called; else
 * the first text on rows 1–3, as before Orbit 2.3, so that nothing already
 * published is found on a screen of another name.
 */
function identityOf(screen: Screen): string {
  const { fields } = screen;
  const code = fields.find((f) => f.protected && f.row === 0 && CODE.test(f.text.trim()));
  if (code) return code.text.trim();
  // A title is words that stand alone on their row: beside it, at most a
  // clock or something short (a version, a user). "ISPF PARMS" on a menu row
  // is one choice among several; "SERVICE REQUEST LOOKUP" is the screen's name.
  const texts = (row: number) => fields.filter((f) => f.protected && f.row === row && bare(f.text));
  const alone = (f: Field) => texts(f.row).every((x) => x === f || CLOCK.test(bare(x.text)) || bare(x.text).length < 9);
  const titled = (f: Field) => f.protected && !LABEL.test(f.text.trim()) && !CLOCK.test(bare(f.text))
    && /\S\s\S/.test(bare(f.text)) && alone(f);
  const title = fields.find((f) => f.row >= 1 && f.row <= 3 && titled(f)) ?? fields.find((f) => f.row === 0 && titled(f));
  if (title) return bare(title.text);
  if (screen.lineMode) return liveOf(screen)?.label ?? '';
  const named = entriesOf({ ...screen, identity: '' }).find((e) => e.seen.what === 'field');
  if (named) return named.seen.name;
  const first = fields.find((f) => f.protected && f.row >= 1 && f.row <= 3 && f.text.trim() && !LABEL.test(f.text.trim()));
  return first?.text.trim() ?? '';
}

/** A title without the rules drawn either side of it: "----  TSO COMMAND PROCESSOR  ----". */
const bare = (text: string) => text.replace(/^[\s\-=*:]+|[\s\-=*]+$/g, '').replace(/\s+/g, ' ');

/**
 * On a screen written line by line: the field with the cursor, and the prompt
 * the host wrote before it. With no fields at all (TSO's READY), the rest of
 * the screen from the cursor is the input.
 */
function liveOf(screen: Screen): { field: Field; label: string } | null {
  const c = screen.cursor;
  if (!c) return null;
  const at = c.row * screen.columns + c.column;
  const offset = (f: Field) => f.row * screen.columns + f.column;
  const field = screen.fields.find((f) => at >= offset(f) - 1 && at < offset(f) + Math.max(1, f.length))
    ?? (screen.fields.length === 0
      ? { attrRow: c.row, attrColumn: c.column, row: c.row, column: c.column, length: screen.rows * screen.columns - at,
          protected: false, hidden: false, intense: false, text: '' }
      : null);
  if (!field) return null;
  const before = screen.fields.filter((f) => offset(f) < offset(field) && f.text.trim()).at(-1)?.text
    ?? [screen.lines[c.row]!.slice(0, c.column), ...screen.lines.slice(0, c.row).reverse()].find((l) => l.trim());
  return { field, label: cleanPrompt(before ?? '') };
}

/** One entry of a key line: `PF5=APPROVE`. */
interface KeyEntry { key: string; label: string; field: Field; offset: number }

function keysOf(f: Field): KeyEntry[] {
  const out: KeyEntry[] = [];
  // Entries are separated by two spaces or more; one space is inside a label.
  const text = f.text;
  const parts = text.split(/\s{2,}/);
  let cursor = 0;
  for (const part of parts) {
    const at = text.indexOf(part, cursor);
    cursor = at + part.length;
    const k = KEY.exec(part.trim());
    if (k) out.push({ key: k[1]!, label: k[2]!.trim(), field: f, offset: at });
  }
  return out;
}

/**
 * The label a field or value sits after: the nearest text before it on its
 * row, skipping the empty attribute that closes an input, and never reaching
 * past an input — "(CONV FHA VA JUMB)" after the PROGRAM box is a hint, not a
 * second thing called PROGRAM.
 */
function labelBefore(row: Field[], f: Field, above: Field[] = []): string | undefined {
  const before = row.filter((x) => x.column < f.column).sort((a, b) => b.column - a.column);
  for (const x of before) {
    if (!x.protected) return undefined;
    if (!x.text.trim()) continue;
    if (!LABEL.test(x.text.trim())) return undefined;
    // A bare "===>" is named by what the screen writes over it:
    // "ENTER TSO COMMAND, CLIST, OR REXX EXEC BELOW:".
    return cleanLabel(x.text) || labelAbove(above, f);
  }
  return undefined;
}

function labelAbove(fields: Field[], f: Field): string | undefined {
  const over = fields.filter((x) => x.protected && x.row < f.row && x.row >= f.row - 3 && x.text.trim())
    .sort((a, b) => b.row - a.row || a.column - b.column)[0];
  return over ? cleanLabel(over.text) || undefined : undefined;
}

const isKeyLine = (f: Field) => f.protected && f.text.split(/\s{2,}/).some((p) => KEY.test(p.trim()));

/**
 * The screen as the model is shown it: the same shape a web page takes.
 *
 * A field is named by the label before it on its row; a value by the label
 * before it; a key by what its legend says it does (`APPROVE`, never `PF5`,
 * because the verb is what Decision 16 checks a press against); the title
 * and header are headings; any other text — a message — is a value to read.
 * Enter is offered where a screen takes input and no legend names it: every
 * 3270 screen answers it, and most do not say so.
 *
 * A screen written line by line offers one field, the live one, named by the
 * prompt before it; what the host wrote earlier is there to be read.
 */
export function seenOf(screen: Screen): Seen[] {
  return entriesOf(screen).map((e) => e.seen);
}

interface Entry { seen: Seen; field: Field }

function entriesOf(screen: Screen): Entry[] {
  const out: Entry[] = [];
  const add = (field: Field, s: Omit<Seen, 'index'>) => out.push({ field, seen: { index: out.length + 1, ...s } as Seen });
  const binding = (f: Field, what: TerminalBinding['what'], extra: Partial<TerminalBinding> = {}): TerminalBinding =>
    ({ connector: 'tn3270', screen: screen.identity, what, row: f.row, column: f.column, length: f.length, ...extra });
  const enter = (f: Field) => add(f, { what: 'button', role: 'key', name: 'ENTER',
    binding: binding(f, 'key', { key: 'ENTER', label: 'ENTER' }) as never });

  if (screen.lineMode) {
    const live = liveOf(screen);
    for (const f of screen.fields) {
      if (f === live?.field || !f.text.trim()) continue;
      add(f, { what: 'value', role: 'text', name: f.text.trim(), binding: binding(f, 'value') as never });
    }
    if (live && live.label && live.label !== PAUSE) {
      add(live.field, { what: 'field', role: 'textbox', name: live.label, ...(live.field.hidden ? { secret: true } : {}),
        binding: binding(live.field, 'field', { label: live.label }) as never });
    }
    if (live) enter(live.field);
    return out;
  }

  const byRow = new Map<number, Field[]>();
  for (const f of screen.fields) byRow.set(f.row, [...(byRow.get(f.row) ?? []), f]);
  let enterListed = false;
  let takesInput: Field | null = null;

  for (const f of screen.fields) {
    const text = f.text.trim();
    const label = labelBefore(byRow.get(f.row) ?? [], f, screen.fields);

    if (!f.protected) {
      if (!label) continue;          // a field nothing names cannot be found again
      takesInput ??= f;
      add(f, { what: 'field', role: 'textbox', name: label, ...(f.hidden ? { secret: true } : {}),
        binding: binding(f, 'field', { label }) as never });
      continue;
    }
    if (!text) continue;
    if (isKeyLine(f)) {
      for (const k of keysOf(f)) {
        if (k.key === 'ENTER') enterListed = true;
        add(f, { what: 'button', role: 'key', name: k.label,
          binding: { connector: 'tn3270', screen: screen.identity, what: 'key', key: k.key, label: k.label,
            row: f.row, column: f.column + k.offset, length: `${k.key}=${k.label}`.length } as never });
      }
      continue;
    }
    if (LABEL.test(text)) continue;  // a label names the field or value after it
    if (label) {
      add(f, { what: 'value', role: 'text', name: text, labelledBy: label, binding: binding(f, 'value', { label }) as never });
      continue;
    }
    if (f.row <= 1) {
      add(f, { what: 'heading', role: 'heading', name: text, binding: binding(f, 'value') as never });
      continue;
    }
    add(f, { what: 'value', role: 'text', name: text, binding: binding(f, 'value') as never });
  }
  if (takesInput && !enterListed) enter(takesInput);
  return out;
}

export type Located =
  | { found: 'one'; field: Field; key?: string }
  | { found: 'none'; why: string; unexpectedScreen?: true }
  | { found: 'many'; count: number };

/** Finding a step's field again on the screen as it now is (Decision 18). */
export function locate(screen: Screen, b: TerminalBinding): Located {
  if (b.screen && screen.identity !== b.screen) {
    return { found: 'none', unexpectedScreen: true,
      why: `The screen showing is ${screen.identity || 'one without a name'}, and this step was mapped on ${b.screen}.` };
  }
  const same = entriesOf(screen).filter(({ seen: s }) => {
    const x = s.binding as unknown as TerminalBinding;
    if (x.what !== b.what) return false;
    if (b.what === 'key') return x.key === b.key;
    if (b.label) return x.label === b.label;
    return x.row === b.row && x.column === b.column;
  });
  if (same.length === 0) {
    return { found: 'none', why: b.what === 'key'
      ? `${b.key} is not on this screen's key line.`
      : `Nothing labelled "${b.label ?? `at row ${b.row + 1}`}" is on ${screen.identity}.` };
  }
  if (same.length > 1) return { found: 'many', count: same.length };
  const { seen, field } = same[0]!;
  const x = seen.binding as unknown as TerminalBinding;
  // On a screen written line by line the host writes where it is up to, so a
  // prompt is found by what it asks, not where; a formatted screen's field
  // that has moved is a refusal.
  if (b.what !== 'key' && !screen.lineMode && (x.row !== b.row || x.column !== b.column)) {
    return { found: 'none', why: `"${b.label}" has moved: it was at row ${b.row + 1}, column ${b.column + 1}, and is now at row ${x.row + 1}, column ${x.column + 1}.` };
  }
  return { found: 'one', field, ...(b.key ? { key: b.key } : {}) };
}

/** The s3270 command a key is pressed with. */
export function commandFor(key: string): string {
  if (key === 'ENTER') return 'Enter()';
  if (key === 'CLEAR') return 'Clear()';
  const pa = /^PA([1-3])$/.exec(key);
  if (pa) return `PA(${pa[1]})`;
  const pf = /^PF(\d{1,2})$/.exec(key);
  if (pf) return `PF(${pf[1]})`;
  throw new Error(`${key} is not a key Orbit presses`);
}

/** The picture of a green screen: its text, as an image, with a field boxed (C9). */
const CELL_W = 9.6, CELL_H = 19, PAD = 14;
export function pictureOf(screen: Screen, box?: { row: number; column: number; length: number }): { bytes: Buffer; mediaType: string } {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const width = Math.round(screen.columns * CELL_W + PAD * 2), height = Math.round(screen.rows * CELL_H + PAD * 2);
  const bright = new Set<string>();
  for (const f of screen.fields) {
    if (f.intense || !f.protected) for (let i = 0; i < f.length; i++) bright.add(`${f.row}:${f.column + i}`);
  }
  const rows = screen.lines.map((line, r) => {
    // Runs of normal and bright text, so a value stands out from its label.
    const spans: string[] = [];
    let run = '', kind = '';
    const flush = () => { if (run) spans.push(`<tspan fill="${kind === 'b' ? '#F2FFF4' : '#3DDC6E'}">${esc(run)}</tspan>`); run = ''; };
    for (let c = 0; c < line.length; c++) {
      const k = bright.has(`${r}:${c}`) ? 'b' : 'n';
      if (k !== kind) { flush(); kind = k; }
      run += line[c];
    }
    flush();
    return `<text x="${PAD}" y="${PAD + (r + 1) * CELL_H - 5}" xml:space="preserve">${spans.join('')}</text>`;
  });
  const outline = box
    ? `<rect x="${PAD + box.column * CELL_W - 2}" y="${PAD + box.row * CELL_H + 1}" width="${Math.max(1, box.length) * CELL_W + 4}" height="${CELL_H}" fill="none" stroke="#FF6B6B" stroke-width="2" rx="2"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<rect width="100%" height="100%" fill="#07110A"/>`
    + `<g font-family="IBM Plex Mono, Menlo, monospace" font-size="16">${rows.join('')}</g>${outline}</svg>`;
  return { bytes: Buffer.from(svg, 'utf8'), mediaType: 'image/svg+xml' };
}

/** Where a field is on that picture, in its pixels (for a run's evidence). */
export function pixelsOf(screen: Screen, f: { row: number; column: number; length: number }) {
  void screen;
  return { x: PAD + f.column * CELL_W, y: PAD + f.row * CELL_H, width: Math.max(1, f.length) * CELL_W, height: CELL_H };
}

/** And as fractions of it (for a walk's picture). */
export function fractionOf(screen: Screen, f: { row: number; column: number; length: number }) {
  const width = screen.columns * CELL_W + PAD * 2, height = screen.rows * CELL_H + PAD * 2;
  const p = pixelsOf(screen, f);
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return { x: round(p.x / width), y: round(p.y / height), w: round(p.width / width), h: round(p.height / height) };
}
